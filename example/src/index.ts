import {
  createAppIntentsRuntime,
  type AppIntentsNativeModule,
  type LinkingAdapter,
} from "@react-native-app-intents/react-native";

import { openOrder } from "./orders.intents.js";

export { openOrder };

export const exampleIntents = [openOrder] as const;
const nativeModule = getNativeModule();
const linking = getLinking(nativeModule);

declare const require: undefined | ((specifier: string) => unknown);

function getNativeModule(): AppIntentsNativeModule | undefined {
  if (typeof require !== "function") {
    return undefined;
  }

  const reactNative = require("react-native") as {
    TurboModuleRegistry?: {
      get<TModule>(name: string): TModule | null;
    };
  };

  return (
    reactNative.TurboModuleRegistry?.get<AppIntentsNativeModule>("ReactNativeAppIntents") ??
    undefined
  );
}

function getLinking(nativeModule: AppIntentsNativeModule | undefined): LinkingAdapter | undefined {
  if (typeof require !== "function") {
    return undefined;
  }

  const reactNative = require("react-native") as {
    AppState: {
      addEventListener(event: "change", listener: (state: string) => void): { remove(): void };
    };
    Linking: LinkingAdapter;
    NativeEventEmitter: new (module: unknown) => {
      addListener(
        eventName: string,
        listener: (event: { url: string }) => void,
      ): { remove(): void };
    };
  };
  const nativeEmitter = nativeModule ? new reactNative.NativeEventEmitter(nativeModule) : null;

  return {
    addEventListener(_event, listener) {
      const subscriptions: { remove(): void }[] = [];
      const emitPendingNativeUrl = async (): Promise<void> => {
        if (!nativeModule?.getInitialIntentURL) {
          return;
        }

        const url = await nativeModule.getInitialIntentURL();

        if (url) {
          listener({ url });
        }
      };

      if (nativeEmitter) {
        subscriptions.push(nativeEmitter.addListener("appIntentUrl", listener));
      }

      subscriptions.push(
        reactNative.AppState.addEventListener("change", (state) => {
          if (state === "active") {
            void emitPendingNativeUrl();
          }
        }),
      );
      subscriptions.push(reactNative.Linking.addEventListener("url", listener));
      void emitPendingNativeUrl();

      return {
        remove(): void {
          subscriptions.forEach((subscription) => subscription.remove());
        },
      };
    },
    async getInitialURL(): Promise<string | null> {
      if (nativeModule?.getInitialIntentURL) {
        const url = await nativeModule.getInitialIntentURL();

        if (url) {
          return url;
        }
      }

      return reactNative.Linking.getInitialURL();
    },
  };
}

export const exampleRuntime = createAppIntentsRuntime({
  scheme: "example",
  intents: exampleIntents,
  ...(linking ? { linking } : {}),
  ...(nativeModule ? { nativeModule } : {}),
});

export function registerExampleRuntime(onOrderOpen: (orderNumber: string) => void): () => void {
  return exampleRuntime.onIntent(openOrder, ({ orderNumber }) => {
    onOrderOpen(orderNumber);
  });
}
