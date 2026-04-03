import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Configure how notifications should behave when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let cachedToken: string | null = null;

/**
 * Registers for push notifications and obtains an Expo Push Token (or FCM token).
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (cachedToken) return cachedToken;

  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return null;
    }
    
    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

      if (!projectId) {
         console.warn('No EAS projectId found in app.json. Are you running bare Expo Go without EAS? Skipping Push Token generation to prevent crash.');
         return null;
      }
      
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      
      console.log('Successfully acquired push token:', token);
      cachedToken = token;
    } catch (e) {
      console.warn('Error fetching push token (expected in bare Expo Go):', e);
    }
  } else {
    console.warn('Must use physical device for Push Notifications');
  }

  return token || null;
}

/**
 * Gets the current token immediately (if already fetched and cached)
 */
export function getCachedPushToken(): string | null {
  return cachedToken;
}
