// Mobil oturum saklama adaptörü — web'in `localStorage`'ına karşılık gelen
// mobil tarafı (bkz. hasat-vault/Build/Shared-Architecture.md → Katman 3).
//
// `expo-secure-store` tek başına yeterli değil: iOS Keychain/Android Keystore
// değer başına ~2048 byte sınırı taşır, Supabase'in oturum payload'u (JWT +
// refresh token + user metadata) bunu kolayca aşar. Resmi Supabase+Expo
// deseni: gerçek veri `AsyncStorage`'a AES ile şifreli yazılır, şifreleme
// anahtarının kendisi (küçük, sınıra girer) `SecureStore`'da tutulur.
import "react-native-get-random-values";
import * as aesjs from "aes-js";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { HasatAuthStorageAdapter } from "@/lib/core";

export class LargeSecureStore implements HasatAuthStorageAdapter {
  private async encrypt(key: string, value: string): Promise<string> {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async decrypt(key: string, value: string): Promise<string | null> {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string): Promise<string | null> {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this.decrypt(key, encrypted);
  }

  async setItem(key: string, value: string): Promise<void> {
    const encrypted = await this.encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }
}
