import assert from "node:assert/strict";
import test from "node:test";

import { defineEntity, defineIntent, p } from "@react-native-app-intents/core";

import { buildIntentUrl, createAppIntentsRuntime, parseIntentUrl } from "../src/index.js";

function createLinkingAdapter(initialUrl: string | null = null) {
  let currentInitialUrl = initialUrl;
  let listener: ((event: { url: string }) => void) | null = null;

  return {
    adapter: {
      addEventListener(_event: "url", nextListener: (event: { url: string }) => void) {
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

function createEagerInitialLinkingAdapter(initialUrl: string | null = null) {
  let currentInitialUrl = initialUrl;
  let listener: ((event: { url: string }) => void) | null = null;

  return {
    adapter: {
      addEventListener(_event: "url", nextListener: (event: { url: string }) => void) {
        listener = nextListener;

        if (currentInitialUrl) {
          const url = currentInitialUrl;
          currentInitialUrl = null;
          queueMicrotask(() => {
            listener?.({ url });
          });
        }

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
  assert.equal(donated[0], 'openOrder:{"orderNumber":"5678"}');
  assert.deepEqual(shortcutUpdates[0], [
    {
      id: "openOrder",
      title: "Open Order 1234",
      url: "example://app-intents/openOrder?payload=%7B%22orderNumber%22%3A%225678%22%7D",
    },
  ]);
});

test("runtime preserves the initial intent when linking emits it during startup", async () => {
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    params: {
      orderNumber: p.string(),
    },
  });
  const linking = createEagerInitialLinkingAdapter(
    buildIntentUrl("example", openOrder, { orderNumber: "1234" }),
  );
  const runtime = createAppIntentsRuntime({
    scheme: "example",
    intents: [openOrder] as const,
    linking: linking.adapter,
    nativeModule: {
      async donate() {},
      async updateDynamicShortcuts() {},
    },
  });

  const received: string[] = [];
  const unsubscribe = runtime.onIntent(openOrder, ({ orderNumber }) => {
    received.push(orderNumber);
  });
  const initialIntent = await runtime.getInitialIntent();
  linking.emit(buildIntentUrl("example", openOrder, { orderNumber: "5678" }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  unsubscribe();
  runtime.dispose();

  assert.deepEqual(initialIntent, {
    id: "openOrder",
    intent: openOrder,
    params: { orderNumber: "1234" },
    url: "example://app-intents/openOrder?payload=%7B%22orderNumber%22%3A%221234%22%7D",
  });
  assert.deepEqual(received, ["5678"]);
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

test("runtime serializes and parses entity params", async () => {
  const Order = defineEntity({
    id: "Order",
    title: "Order",
    inventory: [{ customer: "Taylor", id: 1, number: "1234" }],
    schema: p.object({
      id: p.int(),
      number: p.string(),
      customer: p.string(),
    }),
    identifier: (order) => String(order.id),
    displayRepresentation: (order) => ({
      title: `Order #${order.number}`,
      subtitle: order.customer,
    }),
  });
  const openSavedOrder = defineIntent({
    id: "openSavedOrder",
    title: "Open Saved Order",
    params: {
      order: p.entity(Order),
    },
  });
  const params = { order: { customer: "Taylor", id: 1, number: "1234" } };
  const url = buildIntentUrl("example", openSavedOrder, params);
  const linking = createLinkingAdapter(url);
  const runtime = createAppIntentsRuntime({
    scheme: "example",
    intents: [openSavedOrder] as const,
    linking: linking.adapter,
    nativeModule: {
      async donate() {},
      async updateDynamicShortcuts() {},
    },
  });

  const initialIntent = await runtime.getInitialIntent();
  const parsed = parseIntentUrl(
    {
      scheme: "example",
      intentsById: new Map([[openSavedOrder.id, openSavedOrder]]),
    },
    url,
  );
  runtime.dispose();

  assert.equal(
    url,
    "example://app-intents/openSavedOrder?payload=%7B%22order%22%3A%7B%22id%22%3A1%2C%22number%22%3A%221234%22%2C%22customer%22%3A%22Taylor%22%7D%7D",
  );
  assert.deepEqual(initialIntent, {
    id: "openSavedOrder",
    intent: openSavedOrder,
    params,
    url,
  });
  assert.deepEqual(parsed, {
    id: "openSavedOrder",
    intent: openSavedOrder,
    params,
    url,
  });
});
