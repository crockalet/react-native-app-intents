#import "ReactNativeAppIntents.h"

#import <UIKit/UIKit.h>

static NSMutableArray<NSString *> *ReactNativeAppIntentsPendingURLs = nil;
static __weak ReactNativeAppIntents *ReactNativeAppIntentsCurrentModule = nil;
static NSString *const ReactNativeAppIntentsPendingURLsDefaultsKey = @"ReactNativeAppIntentsPendingURLs";

static void ReactNativeAppIntentsEnsurePendingQueue(void)
{
  if (ReactNativeAppIntentsPendingURLs == nil) {
    ReactNativeAppIntentsPendingURLs = [NSMutableArray new];
  }
}

static void ReactNativeAppIntentsImportPersistedPendingURLs(void)
{
  NSArray<NSString *> *persistedURLs =
    [[NSUserDefaults standardUserDefaults] stringArrayForKey:ReactNativeAppIntentsPendingURLsDefaultsKey];

  if (persistedURLs.count == 0) {
    return;
  }

  ReactNativeAppIntentsEnsurePendingQueue();
  [ReactNativeAppIntentsPendingURLs addObjectsFromArray:persistedURLs];
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:ReactNativeAppIntentsPendingURLsDefaultsKey];
}

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
  ReactNativeAppIntentsImportPersistedPendingURLs();
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
  ReactNativeAppIntentsImportPersistedPendingURLs();
  NSString *url = ReactNativeAppIntentsPendingURLs.firstObject;

  if (url != nil) {
    [ReactNativeAppIntentsPendingURLs removeObjectAtIndex:0];
  }

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

  if (ReactNativeAppIntentsPendingURLs == nil) {
    ReactNativeAppIntentsEnsurePendingQueue();
  }

  [ReactNativeAppIntentsPendingURLs addObject:[url copy]];

  if (ReactNativeAppIntentsCurrentModule != nil) {
    [ReactNativeAppIntentsCurrentModule emitPendingIntentURLIfNeeded];
  }
}

- (void)emitPendingIntentURLIfNeeded
{
  NSString *url = ReactNativeAppIntentsPendingURLs.firstObject;

  if (url == nil) {
    return;
  }

  [self sendEventWithName:@"appIntentUrl" body:@{ @"url": url }];
}

@end
