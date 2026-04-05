package com.getout.app;

import android.content.Intent;
import android.graphics.Color;
import android.webkit.WebView;
import android.text.TextUtils;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {
    private static final String EXTRA_SHARE_TARGET = "share_target";
    private static final String TARGET_COLLECTION = "collection";
    private static final String TARGET_GROUP_VENUE = "group_venue";
    private static final int APP_BACKGROUND_COLOR = Color.parseColor("#0A0A0D");
    private final AtomicBoolean webViewReady = new AtomicBoolean(false);

    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !webViewReady.get());
        bridgeBuilder.addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                markWebViewReady(view);
            }

            @Override
            public void onPageLoaded(WebView webView) {
                markWebViewReady(webView);
            }

            @Override
            public void onReceivedError(WebView webView) {
                markWebViewReady(webView);
            }

            @Override
            public void onReceivedHttpError(WebView webView) {
                markWebViewReady(webView);
            }
        });
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(ShareLauncherPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        super.onCreate(savedInstanceState);
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setBackgroundColor(APP_BACKGROUND_COLOR);
            bridge.getWebView().setAlpha(0f);
            if (bridge.getWebView().getProgress() == 100) {
                markWebViewReady(bridge.getWebView());
            }
        } else {
            webViewReady.set(true);
        }
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

    private void markWebViewReady(WebView webView) {
        if (webView == null) {
            webViewReady.set(true);
            return;
        }

        webView.post(() -> {
            webView.setBackgroundColor(APP_BACKGROUND_COLOR);
            webView.setAlpha(1f);
            webViewReady.set(true);
        });
    }
}
