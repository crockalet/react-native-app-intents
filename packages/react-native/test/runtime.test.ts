import assert from "node:assert/strict";
import test from "node:test";

import { defineIntent, p } from "@react-native-app-intents/core";

import {
  buildIntentUrl,
  createAppIntentsRuntime,
  parseIntentUrl,
} from "../src/index.js";

function createLinkingAdapter(initialUrl: string | null = null) {
  let currentInitialUrl = initialUrl;
  let listener: ((event: { url: string }) => void) | null = null;

  return {
    adapter: {
      addEventListener(
        _event: "url",
        nextListener: (event: { url: string }) => void,
      ) {
        listener = nextListener;
        return {
          remove() {
            listener = null;
          },
        };
      },
      async getInitialURL() {
        return currentInitialUrl;
      },
    },
    emit(url: string) {
      listener?.({ url });
    },
    setInitialUrl(url: string | null) {
      currentInitialUrl = url;
    },
  };
}

test("runtime parses initial urls and emits typed handlers", async () => {
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    params: {
      orderNumber: p.string(),
    },
  });
  const linking = createLinkingAdapter(
    buildIntentUrl("example", openOrder, { orderNumber: "1234" }),
  );
  const donated: string[] = [];
  const shortcutUpdates: unknown[] = [];
  const runtime = createAppIntentsRuntime({
    scheme: "example",
    intents: [openOrder] as const,
    linking: linking.adapter,
    nativeModule: {
      async donate(intentId, payload) {
        donated.push(`${intentId}:${payload}`);
      },
      async updateDynamicShortcuts(shortcuts) {
        shortcutUpdates.push(shortcuts);
      },
    },
  });

  let receivedOrderNumber = "";
  const unsubscribe = runtime.onIntent(openOrder, ({ orderNumber }) => {
    receivedOrderNumber = orderNumber;
  });

  const initialIntent = await runtime.getInitialIntent();
  linking.emit(buildIntentUrl("example", openOrder, { orderNumber: "5678" }));

  await runtime.donate(openOrder, { orderNumber: "5678" });
  await runtime.updateDynamicShortcuts([
    {
      intent: openOrder,
      params: { orderNumber: "5678" },
      shortTitle: "Open Order 1234",
    },
  ]);

  unsubscribe();
  runtime.dispose();

  assert.equal(receivedOrderNumber, "5678");
  assert.deepEqual(initialIntent, {
    id: "openOrder",
    intent: openOrder,
    params: { orderNumber: "1234" },
    url: "example://app-intents/openOrder?payload=%7B%22orderNumber%22%3A%221234%22%7D",
  });
  assert.equal(
    donated[0],
    'openOrder:{"orderNumber":"5678"}',
  );
  assert.deepEqual(shortcutUpdates[0], [
    {
      id: "openOrder",
      title: "Open Order 1234",
      url: "example://app-intents/openOrder?payload=%7B%22orderNumber%22%3A%225678%22%7D",
    },
  ]);
});

test("parseIntentUrl ignores unrelated urls", () => {
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    params: {
      orderNumber: p.string(),
    },
  });

  const parsed = parseIntentUrl(
    {
      scheme: "example",
      intentsById: new Map([[openOrder.id, openOrder]]),
    },
    "https://example.com/orders/1234",
  );

  assert.equal(parsed, null);
});
