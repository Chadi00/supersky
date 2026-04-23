import type { AgentMessage } from "../vendor/pi-agent-core/index.js";
import type { UserMessage } from "../vendor/pi-ai/index.js";
import type { SessionServices } from "./providerState/services";
import type {
	SessionPatch,
	SessionRevertState,
} from "./providerState/sessionStore";

export function getVisibleSessionMessages(
	messages: readonly AgentMessage[],
	revert: SessionRevertState | null,
) {
	if (!revert) {
		return [...messages];
	}
	return messages.filter(
		(message) => message.timestamp < revert.messageTimestamp,
	);
}

export function getRevertedUserMessages(
	messages: readonly AgentMessage[],
	revert: SessionRevertState | null,
) {
	if (!revert) {
		return [] as UserMessage[];
	}
	return messages.filter(
		(message): message is UserMessage =>
			message.role === "user" && message.timestamp >= revert.messageTimestamp,
	);
}

function pruneSnapshots(services: SessionServices) {
	services.workspaceSnapshotStore.pruneReferencedSnapshotIds(
		services.sessionStore.listReferencedSnapshotIds(),
	);
}

export function applySessionRevert(
	services: SessionServices,
	sessionId: string,
	messageTimestamp: number,
) {
	const session = services.sessionStore.getSession(sessionId);
	if (!session) {
		return null;
	}

	const snapshotId =
		session.revert?.snapshotId ?? services.workspaceSnapshotStore.track();
	if (session.revert?.snapshotId) {
		services.workspaceSnapshotStore.restore(session.revert.snapshotId);
	}

	const patches = services.sessionStore
		.listSessionPatches(sessionId)
		.filter((patch) => patch.messageTimestamp >= messageTimestamp);
	if (patches.length > 0) {
		services.workspaceSnapshotStore.revert(patches);
	}

	const revert: SessionRevertState = {
		messageTimestamp,
		snapshotId,
		diff: services.workspaceSnapshotStore.diff(snapshotId),
	};
	services.sessionStore.setSessionRevert(sessionId, revert);
	pruneSnapshots(services);
	return revert;
}

export function cleanupSessionRevert(
	services: SessionServices,
	sessionId: string,
	messages: readonly AgentMessage[],
) {
	const session = services.sessionStore.getSession(sessionId);
	if (!session?.revert) {
		return [...messages];
	}

	const nextMessages = getVisibleSessionMessages(messages, session.revert);
	services.sessionStore.replaceSessionMessages(sessionId, nextMessages);
	services.sessionStore.deleteSessionPatchesFrom(
		sessionId,
		session.revert.messageTimestamp,
	);
	services.sessionStore.setSessionRevert(sessionId, null);
	pruneSnapshots(services);
	return nextMessages;
}

export function unrevertSession(services: SessionServices, sessionId: string) {
	const session = services.sessionStore.getSession(sessionId);
	if (!session?.revert) {
		return null;
	}

	services.workspaceSnapshotStore.restore(session.revert.snapshotId);
	services.sessionStore.setSessionRevert(sessionId, null);
	pruneSnapshots(services);
	return session.revert;
}

export function cloneSessionPatchesBefore(
	patches: readonly SessionPatch[],
	messageTimestamp: number,
) {
	return patches
		.filter((patch) => patch.messageTimestamp < messageTimestamp)
		.map((patch) => ({
			messageTimestamp: patch.messageTimestamp,
			snapshotId: patch.snapshotId,
			files: [...patch.files],
		}));
}
