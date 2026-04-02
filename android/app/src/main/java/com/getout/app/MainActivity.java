package com.getout.app;

import android.content.Intent;
import android.text.TextUtils;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {
    private static final String EXTRA_SHARE_TARGET = "share_target";
    private static final String TARGET_COLLECTION = "collection";
    private static final String TARGET_GROUP_VENUE = "group_venue";

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(ShareLauncherPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        handleShareIntent(getIntent());
        handleNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }

        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (TextUtils.isEmpty(sharedText)) {
            return;
        }

        String shareTarget = resolveShareTarget(intent);
        ShareIntentPlugin.setPendingShare(sharedText, shareTarget);

        if (bridge == null) {
            return;
        }

        PluginHandle pluginHandle = bridge.getPlugin("ShareIntent");
        if (pluginHandle == null) {
            return;
        }

        Plugin plugin = pluginHandle.getInstance();
        if (plugin instanceof ShareIntentPlugin) {
            ((ShareIntentPlugin) plugin).emitPendingShare(sharedText, shareTarget);
        }
    }

    private String resolveShareTarget(Intent intent) {
        String target = intent.getStringExtra(EXTRA_SHARE_TARGET);
        if (TARGET_COLLECTION.equals(target)) {
            return TARGET_COLLECTION;
        }

        return TARGET_GROUP_VENUE;
    }

    private void handleNotificationIntent(Intent intent) {
        NativeNotificationsPlugin.handleNotificationIntent(intent);
    }
}
