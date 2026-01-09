import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform, Text, View } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function HomeScreen() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 🔴 Put your NGROK URL here (must be https)
  const BACKEND_BASE_URL = "https://fanvue-notifications.railway.internal/";

  useEffect(() => {
    (async () => {
      try {
        const t = await registerForPush();
        setToken(t);
        setError(null);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, []);

  async function registerForPush() {
    if (!Device.isDevice) {
      throw new Error("Push notifications require a physical iPhone (Expo Go).");
    }

    const perm = await Notifications.getPermissionsAsync();
    let status = perm.status;

    if (status !== "granted") {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }

    if (status !== "granted") {
      throw new Error("Notification permissions not granted.");
    }

    const expoPushToken = (await Notifications.getExpoPushTokenAsync()).data;

    const resp = await fetch(`${BACKEND_BASE_URL}/devices/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: expoPushToken }),
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Backend /devices/register failed: ${resp.status} ${txt}`);
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    return expoPushToken;
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "white" }}>
      <Text style={{ fontSize: 22, marginBottom: 12, color: "black" }}>Fanvue Alerts</Text>

      {error ? (
        <>
          <Text style={{ fontWeight: "600", marginBottom: 6, color: "black" }}>Error:</Text>
          <Text selectable style={{ textAlign: "center", color: "black" }}>{error}</Text>
        </>
      ) : (
        <>
          <Text style={{ marginBottom: 6, color: "black" }}>Expo push token:</Text>
          <Text selectable style={{ textAlign: "center", color: "black" }}>
            {token ?? "Registering… (allow notifications when prompted)"}
          </Text>
        </>
      )}
    </View>
  );
}
