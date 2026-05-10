import AppIntents
import Foundation

@available(iOS 18.0, *)
private struct OpenOrderPayload: Encodable {
  let orderNumber: String
}

@available(iOS 18.0, *)
struct OpenOrderIntent: AppIntent {
  static let title: LocalizedStringResource = "Open Order"
  static let description = IntentDescription(
    "Open a specific order inside the React Native example app."
  )
  static let openAppWhenRun = true

  @Parameter(
    title: "Order Number",
    requestValueDialog: IntentDialog("Which order would you like to open?")
  )
  var orderNumber: String

  func perform() async throws -> some IntentResult & OpensIntent {
    let payload = try JSONEncoder().encode(
      OpenOrderPayload(orderNumber: orderNumber)
    )
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

    return .result(opensIntent: OpenURLIntent(url))
  }
}

@available(iOS 18.0, *)
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
        systemImageName: "shippingbox"
      ),
    ]
  }
}
