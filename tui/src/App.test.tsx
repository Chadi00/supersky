import { afterEach, expect, spyOn, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App, appLifecycle } from "./App"

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined

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
