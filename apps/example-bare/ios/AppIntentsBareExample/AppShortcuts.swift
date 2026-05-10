import AppIntents
import Foundation

private let reactNativeAppIntentsPendingURLsKey = "ReactNativeAppIntentsPendingURLs"

private func enqueueReactNativeAppIntentURL(_ url: URL) {
  let defaults = UserDefaults.standard
  var pendingUrls = defaults.stringArray(forKey: reactNativeAppIntentsPendingURLsKey) ?? []
  pendingUrls.append(url.absoluteString)
  defaults.set(pendingUrls, forKey: reactNativeAppIntentsPendingURLsKey)
}

@available(iOS 16.0, *)
private struct OpenOrderPayload: Encodable {
  let orderNumber: String
}

@available(iOS 16.0, *)
struct OpenOrderIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Order"
  static let description = IntentDescription("Open a specific order by number.")
  static let openAppWhenRun = true

  @Parameter(
    title: "Order number",
    requestValueDialog: IntentDialog("What's the order number?")
  )
  var orderNumber: String

  func perform() async throws -> some IntentResult {
    let payload = try JSONEncoder().encode(OpenOrderPayload(orderNumber: orderNumber))
    let payloadString = String(decoding: payload, as: UTF8.self)
    var components = URLComponents()
    components.scheme = "example"
    components.host = "app-intents"
    components.path = "/openOrder"
    components.queryItems = [
      URLQueryItem(name: "payload", value: payloadString),
    ]

    guard let url = components.url else {
      throw NSError(
        domain: "ReactNativeAppIntents",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Could not create app-intents URL."]
      )
    }

    enqueueReactNativeAppIntentURL(url)
    return .result()
  }
}

@available(iOS 16.0, *)
struct ExampleAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    return [
      AppShortcut(
        intent: OpenOrderIntent(),
        phrases: [
          "Open order in \(.applicationName)",
          "Show my order in \(.applicationName)",
        ],
        shortTitle: "Open Order",
        systemImageName: "square.grid.2x2"
      ),
    ]
  }
}
