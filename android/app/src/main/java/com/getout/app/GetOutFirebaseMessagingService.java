package com.getout.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class GetOutFirebaseMessagingService extends FirebaseMessagingService {

    private static final String CHANNEL_ID = "getout_invites";
    private static final String CHANNEL_NAME = "Group invites";

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        NativeNotificationsPlugin.handleTokenRefresh(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) {
            return;
        }

        showInviteNotification(data);
    }

    private void showInviteNotification(Map<String, String> data) {
        String route = data.get("route");
        if (route == null || route.isEmpty()) {
            return;
        }

        createNotificationChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("getout_route", route);
        intent.putExtra("getout_session_id", data.get("sessionId"));
        intent.putExtra("getout_invite_id", data.get("inviteId"));

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            route.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String title = data.get("title");
        if (title == null || title.isEmpty()) {
            title = "Group invite";
        }

        String body = data.get("body");
        if (body == null || body.isEmpty()) {
            body = "You have been invited to contribute to a group.";
        }

        NotificationCompat.Builder builder =
            new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(route.hashCode(), builder.build());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        NotificationChannel channel =
            new NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        manager.createNotificationChannel(channel);
    }
}
