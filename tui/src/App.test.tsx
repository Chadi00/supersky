import { afterEach, expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { App } from "./App"

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

  expect(frame).toContain("You")
  expect(frame).toContain("send on enter")
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
