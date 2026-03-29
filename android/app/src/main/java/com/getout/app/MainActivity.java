package com.getout.app;

import android.content.Intent;
import android.text.TextUtils;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleShareIntent(intent);
    }

    private void handleShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }

        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (TextUtils.isEmpty(sharedText)) {
            return;
        }

        ShareIntentPlugin.setPendingShareText(sharedText);

        if (bridge == null) {
            return;
        }

        PluginHandle pluginHandle = bridge.getPlugin("ShareIntent");
        if (pluginHandle == null) {
            return;
        }

        Plugin plugin = pluginHandle.getInstance();
        if (plugin instanceof ShareIntentPlugin) {
            ((ShareIntentPlugin) plugin).emitPendingShare(sharedText);
        }
    }
}
