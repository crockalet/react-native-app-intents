import assert from "node:assert/strict";
import test from "node:test";

import {
  defineEntity,
  defineIntent,
  normalizeEntityDefinition,
  normalizeIntentDefinitions,
  normalizeReferencedEntities,
  p,
  type ParamsOf,
} from "../src/index.js";

test("defineIntent preserves typed params", () => {
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    description: "Open a specific order.",
    params: {
      orderNumber: p.string({ title: "Order number" }),
    },
  });

  const params: ParamsOf<typeof openOrder> = { orderNumber: "1234" };

  assert.equal(params.orderNumber, "1234");
});

test("optional params stay optional", () => {
  const focusOrder = defineIntent({
    id: "focusOrder",
    title: "Focus Order",
    params: {
      orderNumber: p.string({ optional: true }),
    },
  });

  const params: ParamsOf<typeof focusOrder> = {};

  assert.deepEqual(params, {});
});

test("defineEntity captures object shapes", async () => {
  const Order = defineEntity({
    id: "Order",
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
    query: async () => [{ id: 1, number: "1234", customer: "Taylor" }],
  });

  const results = await Order.query?.({});

  assert.equal(results?.[0]?.number, "1234");
});

test("normalizeEntityDefinition captures static inventory metadata", () => {
  const Order = defineEntity({
    id: "Order",
    inventory: [{ id: 1, number: "1234", customer: "Taylor" }],
    schema: p.object({
      id: p.int(),
      number: p.string(),
      customer: p.string(),
    }),
    identifier: (order) => String(order.id),
    displayRepresentation: (order) => ({
      title: `Order #${order.number}`,
      subtitle: order.customer,
      image: { systemName: "bag" },
    }),
  });

  const normalized = normalizeEntityDefinition(Order);

  assert.equal(normalized.title, "Order");
  assert.equal(normalized.inventory[0]?.identifier, "1");
  assert.equal(normalized.inventory[0]?.displayRepresentation.imageSystemName, "bag");
  assert.equal(normalized.inventory[0]?.jsonValue, '{"id":1,"number":"1234","customer":"Taylor"}');
});

test("normalizeIntentDefinitions derives app shortcut phrases", () => {
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    phrases: ["Show my order ${orderNumber}"],
    params: {
      orderNumber: p.string(),
    },
    surfaces: {
      appShortcut: true,
    },
  });

  const [normalized] = normalizeIntentDefinitions([openOrder]);

  assert.equal(normalized?.phrases[0]?.appShortcutPhrase, "Show my order in ${.applicationName}");
});

test("normalizeIntentDefinitions captures app shortcut icon metadata", () => {
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    phrases: ["Show my order ${orderNumber}"],
    params: {
      orderNumber: p.string(),
    },
    surfaces: {
      appShortcut: {
        icon: {
          androidResourceName: "@mipmap/ic_launcher_round",
          systemName: "shippingbox",
        },
      },
    },
  });

  const [normalized] = normalizeIntentDefinitions([openOrder]);

  assert.equal(normalized?.surfaces.appShortcut, true);
  assert.equal(normalized?.appShortcut.iconAndroidResourceName, "@mipmap/ic_launcher_round");
  assert.equal(normalized?.appShortcut.iconSystemName, "shippingbox");
});

test("normalizeReferencedEntities discovers entity dependencies from intent params", () => {
  const Order = defineEntity({
    id: "Order",
    inventory: [{ id: 1, number: "1234", customer: "Taylor" }],
    schema: p.object({
      id: p.int(),
      number: p.string(),
      customer: p.string(),
    }),
    identifier: (order) => String(order.id),
    displayRepresentation: (order) => ({
      title: `Order #${order.number}`,
    }),
  });
  const openOrder = defineIntent({
    id: "openOrder",
    title: "Open Order",
    phrases: ["Open ${order}"],
    params: {
      order: p.entity(Order, {
        androidBiiParam: "order",
        default: { id: 1, number: "1234", customer: "Taylor" },
      }),
    },
    surfaces: {
      appShortcut: true,
    },
  });

  const entities = normalizeReferencedEntities([openOrder]);

  assert.equal(entities[0]?.id, "Order");
  assert.equal(entities[0]?.inventory[0]?.displayRepresentation.title, "Order #1234");
});
