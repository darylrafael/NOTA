import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'nota_device_id';

export async function getDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch (error) {
    return 'fallback_device_id';
  }
}
