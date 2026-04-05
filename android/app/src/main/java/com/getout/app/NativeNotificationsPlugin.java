package com.getout.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(
    name = "NativeNotifications",
    permissions = {
        @Permission(alias = "notifications", strings = {Manifest.permission.POST_NOTIFICATIONS})
    }
)
public class NativeNotificationsPlugin extends Plugin {

    private static final String EXTRA_ROUTE = "getout_route";
    private static final String EXTRA_SESSION_ID = "getout_session_id";
    private static final String EXTRA_INVITE_ID = "getout_invite_id";
    private static final String EXTRA_ROUTE_FCM = "route";
    private static final String EXTRA_SESSION_ID_FCM = "sessionId";
    private static final String EXTRA_INVITE_ID_FCM = "inviteId";

    private static NativeNotificationsPlugin instance;
    private static JSObject pendingLaunchNotification;
    private static JSObject launchNotificationSnapshot;

    @Override
    public void load() {
        instance = this;
        if (pendingLaunchNotification != null) {
            notifyListeners("notificationAction", pendingLaunchNotification, true);
            pendingLaunchNotification = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        if (ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().getToken()
            .addOnSuccessListener(token -> {
                JSObject result = new JSObject();
                result.put("token", token);
                call.resolve(result);
            })
            .addOnFailureListener(error -> call.reject(error.getMessage(), error));
    }

    @PluginMethod
    public void unregisterToken(PluginCall call) {
        FirebaseMessaging.getInstance().deleteToken()
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(error -> call.reject(error.getMessage(), error));
    }

    @PluginMethod
    public void getLaunchNotification(PluginCall call) {
        if (launchNotificationSnapshot == null) {
            call.resolve();
            return;
        }

        JSObject result = launchNotificationSnapshot;
        launchNotificationSnapshot = null;
        pendingLaunchNotification = null;
        call.resolve(result);
    }

    @PluginMethod
    public void peekLaunchNotification(PluginCall call) {
        if (launchNotificationSnapshot == null) {
            call.resolve();
            return;
        }

        call.resolve(launchNotificationSnapshot);
    }

    private static JSObject buildNotificationPayload(Intent intent) {
        if (intent == null) {
          return null;
        }

        Bundle extras = intent.getExtras();
        if (extras == null) {
            return null;
        }

        String route = extras.getString(EXTRA_ROUTE);
        if (route == null || route.isEmpty()) {
            route = extras.getString(EXTRA_ROUTE_FCM);
        }
        if (route == null || route.isEmpty()) {
            return null;
        }

        JSObject result = new JSObject();
        result.put("route", route);
        String sessionId = extras.getString(EXTRA_SESSION_ID);
        if (sessionId == null || sessionId.isEmpty()) {
            sessionId = extras.getString(EXTRA_SESSION_ID_FCM);
        }
        String inviteId = extras.getString(EXTRA_INVITE_ID);
        if (inviteId == null || inviteId.isEmpty()) {
            inviteId = extras.getString(EXTRA_INVITE_ID_FCM);
        }

        result.put("sessionId", sessionId);
        result.put("inviteId", inviteId);
        return result;
    }

    public static void handleNotificationIntent(Intent intent) {
        JSObject payload = buildNotificationPayload(intent);
        if (payload == null) {
            return;
        }

        launchNotificationSnapshot = payload;

        if (instance != null) {
            instance.notifyListeners("notificationAction", payload, true);
            return;
        }

        pendingLaunchNotification = payload;
    }

    public static void handleTokenRefresh(String token) {
        if (instance == null || token == null || token.isEmpty()) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("token", token);
        instance.notifyListeners("tokenRefresh", payload, true);
    }
}
