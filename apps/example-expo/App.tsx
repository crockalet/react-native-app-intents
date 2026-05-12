import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { createAppIntentsRuntime } from "@crockalet/react-native-app-intents";

import { openOrder } from "./src/openOrder.intents";

export default function App() {
  const [lastOrderNumber, setLastOrderNumber] = useState<string | null>(null);
  const appIntents = useMemo(
    () =>
      createAppIntentsRuntime({
        scheme: "appintentsexpo",
        intents: [openOrder] as const,
      }),
    [],
  );

  useEffect(() => {
    return appIntents.onIntent(openOrder, (params) => {
      setLastOrderNumber(params.orderNumber);
    });
  }, [appIntents]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>React Native App Intents</Text>
      <Text>Expo config plugin fixture</Text>
      <Text>Last order: {lastOrderNumber ?? "none"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
  },
});
