package com.reactnativeappintents

import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import java.lang.ref.WeakReference
import java.util.ArrayDeque

class ReactNativeAppIntentsModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  init {
    reactContextRef = WeakReference(reactContext)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun donate(intentId: String, payload: String, promise: Promise) {
    ShortcutManagerCompat.reportShortcutUsed(reactApplicationContext, intentId)
    promise.resolve(null)
  }

  @ReactMethod
  fun getInitialIntentURL(promise: Promise) {
    val currentUrl = if (pendingUrls.isEmpty()) null else pendingUrls.removeFirst()
    promise.resolve(currentUrl)
  }

  @ReactMethod
  fun updateDynamicShortcuts(shortcuts: ReadableArray, promise: Promise) {
    val packageName = reactApplicationContext.packageName
    val shortcutList = mutableListOf<ShortcutInfoCompat>()

    for (index in 0 until shortcuts.size()) {
      val shortcut = shortcuts.getMap(index) ?: continue
      shortcutList.add(createShortcut(shortcut, packageName))
    }

    ShortcutManagerCompat.removeAllDynamicShortcuts(reactApplicationContext)
    ShortcutManagerCompat.addDynamicShortcuts(reactApplicationContext, shortcutList)
    promise.resolve(null)
  }

  private fun createShortcut(
    shortcut: ReadableMap,
    packageName: String,
  ): ShortcutInfoCompat {
    val shortcutId = shortcut.getString("id") ?: error("Shortcut id is required.")
    val title = shortcut.getString("title") ?: shortcutId
    val subtitle = shortcut.getString("subtitle")
    val url = shortcut.getString("url") ?: error("Shortcut url is required.")

    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
      setClassName(packageName, "$packageName.MainActivity")
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
    }

    val builder = ShortcutInfoCompat.Builder(reactApplicationContext, shortcutId)
      .setShortLabel(title)
      .setIntent(intent)
      .setIcon(IconCompat.createWithResource(reactApplicationContext, android.R.mipmap.sym_def_app_icon))

    if (subtitle != null) {
      builder.setLongLabel(subtitle)
    }

    return builder.build()
  }

  companion object {
    const val NAME = "ReactNativeAppIntents"
    private val pendingUrls = ArrayDeque<String>()
    private var reactContextRef: WeakReference<ReactApplicationContext>? = null

    fun handleIntent(intent: Intent?) {
      handleUrl(intent?.dataString)
    }

    private fun handleUrl(url: String?) {
      if (url == null) {
        return
      }

      pendingUrls.addLast(url)

      val reactContext = reactContextRef?.get() ?: return
      val payload = com.facebook.react.bridge.Arguments.createMap().apply {
        putString("url", url)
      }
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("appIntentUrl", payload)
    }
  }
}
