import { defineIntent, p } from "@crockalet/react-native-app-intents";

export const openOrder = defineIntent({
  id: "openOrder",
  title: "Open Order",
  phrases: ["Open order ${orderNumber} in ${.applicationName}"],
  params: {
    orderNumber: p.string({
      androidBiiParam: "order",
      title: "Order number",
      default: "1234",
    }),
  },
  surfaces: { siri: true, spotlight: true, appShortcut: true, assistant: true },
  androidBii: "actions.intent.GET_ORDER",
});
