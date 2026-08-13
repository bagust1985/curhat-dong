import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * Android hardware back — E16-T02.
 *
 * Expo Router already pops the stack. What this adds is the case the router
 * cannot know about: a screen in the middle of a flow where backing out means
 * losing what the person just did — onboarding, a half-written curhat, an open
 * room.
 *
 * Returning `true` from the listener tells Android the app handled the press.
 * Returning `false` lets the default happen, which at the root of the stack
 * means leaving the app — correct on the feed, wrong in the middle of a flow.
 */
export function useAndroidBack(handler: () => boolean): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => subscription.remove();
  }, [handler]);
}
