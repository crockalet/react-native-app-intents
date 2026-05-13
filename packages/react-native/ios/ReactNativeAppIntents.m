#import "ReactNativeAppIntents.h"

#import <Intents/Intents.h>
#import <UIKit/UIKit.h>

static NSMutableArray<NSString *> *ReactNativeAppIntentsPendingURLs = nil;
static __weak ReactNativeAppIntents *ReactNativeAppIntentsCurrentModule = nil;
static NSString *const ReactNativeAppIntentsAppGroupInfoKey = @"ReactNativeAppIntentsAppGroupIdentifier";
static NSString *const ReactNativeAppIntentsPendingURLsDefaultsKey = @"ReactNativeAppIntentsPendingURLs";

static NSUserDefaults *ReactNativeAppIntentsUserDefaults(void)
{
  id suiteName = [[NSBundle mainBundle] objectForInfoDictionaryKey:ReactNativeAppIntentsAppGroupInfoKey];

  if ([suiteName isKindOfClass:[NSString class]] && [(NSString *)suiteName length] > 0) {
    NSUserDefaults *sharedDefaults = [[NSUserDefaults alloc] initWithSuiteName:(NSString *)suiteName];

    if (sharedDefaults != nil) {
      return sharedDefaults;
    }
  }

  return [NSUserDefaults standardUserDefaults];
}

static void ReactNativeAppIntentsEnsurePendingQueue(void)
{
  if (ReactNativeAppIntentsPendingURLs == nil) {
    ReactNativeAppIntentsPendingURLs = [NSMutableArray new];
  }
}

static void ReactNativeAppIntentsImportPersistedPendingURLs(void)
{
  NSArray<NSString *> *persistedURLs =
    [ReactNativeAppIntentsUserDefaults() stringArrayForKey:ReactNativeAppIntentsPendingURLsDefaultsKey];

  if (persistedURLs.count == 0) {
    return;
  }

  ReactNativeAppIntentsEnsurePendingQueue();
  [ReactNativeAppIntentsPendingURLs addObjectsFromArray:persistedURLs];
  [ReactNativeAppIntentsUserDefaults() removeObjectForKey:ReactNativeAppIntentsPendingURLsDefaultsKey];
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
  title:(NSString *)title
  url:(NSString *)url
  payload:(NSString *)payload
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *activityType = [NSString stringWithFormat:@"com.reactnativeappintents.intent.%@", intentId];
    NSUserActivity *activity = [[NSUserActivity alloc] initWithActivityType:activityType];
    activity.title = title;
    activity.eligibleForSearch = YES;
    activity.userInfo = @{ @"payload": payload, @"url": url };
    activity.requiredUserInfoKeys = [NSSet setWithArray:@[ @"payload", @"url" ]];

    if (@available(iOS 12.0, *)) {
      activity.eligibleForPrediction = YES;
      activity.persistentIdentifier = url;
    }

    [activity becomeCurrent];
    resolve(nil);
  });
}

RCT_REMAP_METHOD(
  clearDonations,
  clearDonationsWithResolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  void (^deleteSavedUserActivities)(void) = ^{
    if (@available(iOS 12.0, *)) {
      [NSUserActivity deleteAllSavedUserActivitiesWithCompletionHandler:^{
        resolve(nil);
      }];
      return;
    }

    resolve(nil);
  };

  if (@available(iOS 10.0, *)) {
    [INInteraction deleteAllInteractionsWithCompletion:^(NSError *_Nullable error) {
      if (error != nil) {
        reject(@"clear_donations_failed", error.localizedDescription, error);
        return;
      }

      deleteSavedUserActivities();
    }];
    return;
  }

  deleteSavedUserActivities();
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
      NSDictionary *iconPayload =
        [shortcut[@"icon"] isKindOfClass:[NSDictionary class]] ? shortcut[@"icon"] : nil;
      NSString *systemImageName = iconPayload[@"systemName"];
      NSString *templateImageName = iconPayload[@"iosTemplateImageName"];
      NSDictionary *userInfo = url == nil ? @{} : @{ @"url": url };
      UIApplicationShortcutIcon *icon = nil;

      if (templateImageName != nil) {
        icon = [UIApplicationShortcutIcon iconWithTemplateImageName:templateImageName];
      } else if (systemImageName != nil) {
        if (@available(iOS 13.0, *)) {
          icon = [UIApplicationShortcutIcon iconWithSystemImageName:systemImageName];
        }
      }

      UIApplicationShortcutItem *item = [[UIApplicationShortcutItem alloc]
        initWithType:shortcutId
        localizedTitle:title
        localizedSubtitle:subtitle
        icon:icon
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
