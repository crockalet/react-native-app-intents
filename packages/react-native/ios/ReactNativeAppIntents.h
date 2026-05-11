#import <React/RCTEventEmitter.h>

@interface ReactNativeAppIntents : RCTEventEmitter <RCTBridgeModule>

+ (void)recordIncomingURLString:(NSString *)url;

@end
