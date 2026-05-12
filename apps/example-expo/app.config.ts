export default {
  name: "App Intents Expo Example",
  slug: "app-intents-expo-example",
  scheme: "appintentsexpo",
  version: "1.0.0",
  orientation: "portrait",
  ios: {
    bundleIdentifier: "com.crockalet.appintents.expo",
  },
  android: {
    package: "com.crockalet.appintents.expo",
  },
  plugins: ["@crockalet/react-native-app-intents"],
};
