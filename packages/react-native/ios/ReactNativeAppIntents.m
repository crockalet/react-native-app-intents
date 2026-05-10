#import "ReactNativeAppIntents.h"

#import <UIKit/UIKit.h>

static NSString *ReactNativeAppIntentsPendingURL = nil;
static __weak ReactNativeAppIntents *ReactNativeAppIntentsCurrentModule = nil;

@implementation ReactNativeAppIntents

RCT_EXPORT_MODULE(ReactNativeAppIntents)

- (instancetype)init
{
  self = [super init];

  if (self) {
    ReactNativeAppIntentsCurrentModule = self;
  }

  return self;
}

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (void)dealloc
{
  if (ReactNativeAppIntentsCurrentModule == self) {
    ReactNativeAppIntentsCurrentModule = nil;
  }
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"appIntentUrl" ];
}

- (void)startObserving
{
  [self emitPendingIntentURLIfNeeded];
}

RCT_REMAP_METHOD(
  donate,
  donate:(NSString *)intentId
  payload:(NSString *)payload
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *activityType = [NSString stringWithFormat:@"com.reactnativeappintents.intent.%@", intentId];
    NSUserActivity *activity = [[NSUserActivity alloc] initWithActivityType:activityType];
    activity.title = intentId;
    activity.userInfo = @{ @"payload": payload };
    [activity becomeCurrent];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(
  getInitialIntentURL,
  getInitialIntentURLWithResolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  NSString *url = ReactNativeAppIntentsPendingURL;
  ReactNativeAppIntentsPendingURL = nil;
  resolve(url);
}

RCT_REMAP_METHOD(
  updateDynamicShortcuts,
  updateDynamicShortcuts:(NSArray<NSDictionary *> *)shortcuts
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSMutableArray<UIApplicationShortcutItem *> *items = [NSMutableArray new];

    for (NSDictionary *shortcut in shortcuts) {
      NSString *shortcutId = shortcut[@"id"];
      NSString *title = shortcut[@"title"];
      NSString *subtitle = shortcut[@"subtitle"];
      NSString *url = shortcut[@"url"];
      NSDictionary *userInfo = url == nil ? @{} : @{ @"url": url };
      UIApplicationShortcutItem *item = [[UIApplicationShortcutItem alloc]
        initWithType:shortcutId
        localizedTitle:title
        localizedSubtitle:subtitle
        icon:nil
        userInfo:userInfo];
      [items addObject:item];
    }

    [UIApplication sharedApplication].shortcutItems = items;
    resolve(nil);
  });
}

+ (void)recordIncomingURLString:(NSString *)url
{
  if (url == nil) {
    return;
  }

  ReactNativeAppIntentsPendingURL = [url copy];

  if (ReactNativeAppIntentsCurrentModule != nil) {
    [ReactNativeAppIntentsCurrentModule emitPendingIntentURLIfNeeded];
  }
}

- (void)emitPendingIntentURLIfNeeded
{
  if (ReactNativeAppIntentsPendingURL == nil) {
    return;
  }

  [self sendEventWithName:@"appIntentUrl" body:@{ @"url": ReactNativeAppIntentsPendingURL }];
}

@end
