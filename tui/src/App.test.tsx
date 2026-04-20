import { afterEach, expect, spyOn, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App, appLifecycle } from "./App"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

type TestSetup = Awaited<ReturnType<typeof testRender>>

function findScrollbox(node: unknown): any {
  if (!node || typeof node !== "object") {
    return null
  }

  const renderable = node as {
    constructor?: { name?: string }
    getChildren?: () => unknown[]
  }

  if (renderable.constructor?.name === "ScrollBoxRenderable") {
    return renderable
  }

  const children = typeof renderable.getChildren === "function" ? renderable.getChildren() : []
  for (const child of children) {
    const found = findScrollbox(child)
    if (found) {
      return found
    }
  }

  return null
}

async function sendMessages(setup: TestSetup, count: number, startIndex = 0) {
  await act(async () => {
    for (let i = 0; i < count; i++) {
      await setup.mockInput.typeText(`message ${startIndex + i}`)
      setup.mockInput.pressKey("RETURN")
      await setup.renderOnce()
    }
  })
}

async function settleScrollLayout(setup: TestSetup) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    await setup.renderOnce()
  })
}

function areScrollbarsHidden(scrollbox: any) {
  return !scrollbox.verticalScrollBar.visible && !scrollbox.horizontalScrollBar.visible
}

function isSidebarVisible(setup: TestSetup) {
  const appShell = setup.renderer.root.getChildren()[0]!
  const body = appShell.getChildren()[0]!
  const sessionLayout = body.getChildren()[0]!

  return sessionLayout.getChildren().length > 1
}

afterEach(async () => {
  if (testSetup) {
    await act(async () => {
      testSetup?.renderer.destroy()
    })
  }
  testSetup = undefined
})

test("renders the supersky TUI shell (new session)", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
  })

  const frame = testSetup.captureCharFrame()

  expect(frame).toContain("supersky")
  expect(frame).toContain("GPT-5.4 OpenAI")
})

test("preserves rapid composer typing without resetting the draft", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
    await testSetup!.mockInput.typeText("fast typing should stay stable")
    await testSetup!.renderOnce()
  })

  const frame = testSetup.captureCharFrame()

  expect(frame).toContain("fast typing should stay stable")
})

test("submits the composer with enter", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
    await testSetup!.mockInput.typeText("send on enter")
    testSetup!.mockInput.pressKey("RETURN")
    await testSetup!.renderOnce()
  })

  const frame = testSetup.captureCharFrame()
  const occurrences = frame.match(/send on enter/g)?.length ?? 0
  const timestampMatch = frame.match(/\b\d{1,2}:\d{2}:\d{2} (AM|PM)\b/)

  expect(frame).toContain("Assistant")
  expect(frame).toContain("send on enter")
  expect(occurrences).toBe(1)
  expect(timestampMatch).not.toBeNull()
})

test("sending exit quits the app", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })
  const requestProcessExit = spyOn(appLifecycle, "requestProcessExit").mockImplementation(() => {})

  await act(async () => {
    await testSetup!.renderOnce()
    await testSetup!.mockInput.typeText("exit")
    testSetup!.mockInput.pressKey("RETURN")
    await testSetup!.renderOnce()
  })

  expect(testSetup.renderer.isDestroyed).toBe(true)
  expect(requestProcessExit).toHaveBeenCalledTimes(1)
})

test("inserts a newline for multiline enter", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
    await testSetup!.mockInput.typeText("line one")
    testSetup!.mockInput.pressKey("LINEFEED")
    await testSetup!.mockInput.typeText("line two")
    await testSetup!.renderOnce()
  })

  const frame = testSetup.captureCharFrame()

  expect(frame).not.toContain("You")
  expect(frame).toContain("line one")
  expect(frame).toContain("line two")
})

test("sending a multiline message does not add an extra blank line", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
    await testSetup!.mockInput.typeText("line one")
    testSetup!.mockInput.pressKey("LINEFEED")
    await testSetup!.mockInput.typeText("line two")
    testSetup!.mockInput.pressKey("RETURN")
    await testSetup!.renderOnce()
  })

  const frame = testSetup.captureCharFrame()
  const lines = frame.split("\n")
  const lineTwoIndex = lines.findIndex((line) => line.includes("line two"))
  const timestampPattern = /\b\d{1,2}:\d{2}:\d{2} (AM|PM)\b/
  const linesAfterMessage = lines.slice(lineTwoIndex + 1, lineTwoIndex + 7).join("\n")

  expect(lineTwoIndex).toBeGreaterThan(-1)
  expect(lines[lineTwoIndex + 1]?.trim()).toMatch(timestampPattern)
  expect(linesAfterMessage).toContain("Assistant")
  expect(linesAfterMessage).toContain("==== OpenTUI Task Complete ====")
})

test("shows the sidebar in-session on wide terminals", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
  })
  await sendMessages(testSetup!, 1)

  expect(isSidebarVisible(testSetup!)).toBe(true)
})

test("keeps the scrollbar hidden when the in-session view first appears without overflow", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
  })
  await sendMessages(testSetup!, 1)

  const scrollbox = findScrollbox(testSetup.renderer.root)

  expect(areScrollbarsHidden(scrollbox)).toBe(true)
})

test("keeps the scrollbars hidden after the message list overflows", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
  })
  await sendMessages(testSetup!, 4)
  await settleScrollLayout(testSetup!)

  const scrollbox = findScrollbox(testSetup.renderer.root)

  expect(areScrollbarsHidden(scrollbox)).toBe(true)
})

test("hides the sidebar on narrow terminals", async () => {
  testSetup = await testRender(<App />, { width: 70, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
  })
  await sendMessages(testSetup!, 1)

  expect(isSidebarVisible(testSetup!)).toBe(false)
})

test("keeps the footer anchored as messages overflow", async () => {
  testSetup = await testRender(<App />, { width: 110, height: 30 })

  await act(async () => {
    await testSetup!.renderOnce()
  })
  await sendMessages(testSetup!, 1)
  await settleScrollLayout(testSetup!)

  const appShell = testSetup.renderer.root.getChildren()[0]!
  const initialBody = appShell.getChildren()[0]!
  const initialFooter = appShell.getChildren()[1]!
  const initialScrollbox = findScrollbox(testSetup.renderer.root)
  const initialGeometry = {
    x: initialScrollbox.x,
    footerY: initialFooter.y,
    footerHeight: initialFooter.height,
    bodyHeight: initialBody.height,
  }

  await sendMessages(testSetup!, 3, 1)
  await settleScrollLayout(testSetup!)

  const settledScrollbox = findScrollbox(testSetup.renderer.root)
  const settledBody = appShell.getChildren()[0]!
  const settledFooter = appShell.getChildren()[1]!

  expect(isSidebarVisible(testSetup!)).toBe(true)
  expect(settledScrollbox.x).toBe(initialGeometry.x)
  expect(settledFooter.y).toBe(initialGeometry.footerY)
  expect(settledFooter.height).toBe(initialGeometry.footerHeight)
  expect(settledBody.height).toBe(initialGeometry.bodyHeight)
})
