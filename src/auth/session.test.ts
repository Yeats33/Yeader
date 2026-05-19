import assert from "node:assert/strict";
import test from "node:test";
import { resetInvokeAdapterForTests, setInvokeAdapterForTests } from "../api.ts";
import { logout, onSessionChange, restoreSession } from "./session.ts";

test("onSessionChange cleanup prevents stale account listeners from firing", async () => {
  resetInvokeAdapterForTests();
  setInvokeAdapterForTests(async <T>(command: string): Promise<T> => {
    if (command === "get_auth_session") {
      return {
        wallet_address: "0xabc",
        chain_id: 1,
        created_at: "2026-01-01T00:00:00Z",
        expires_at: "2099-01-01T00:00:00Z",
      } as T;
    }
    if (command === "clear_auth_session") {
      return undefined as T;
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  let staleCalls = 0;
  let activeCalls = 0;

  const unsubscribeStale = onSessionChange(() => {
    staleCalls += 1;
  });
  const unsubscribeActive = onSessionChange(() => {
    activeCalls += 1;
  });

  unsubscribeStale();

  await restoreSession();

  assert.equal(staleCalls, 0);
  assert.equal(activeCalls, 1);

  await logout();
  unsubscribeActive();
  resetInvokeAdapterForTests();
});
