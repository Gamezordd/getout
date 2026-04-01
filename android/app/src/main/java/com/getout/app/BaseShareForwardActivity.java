package com.getout.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;

public abstract class BaseShareForwardActivity extends Activity {
    private static final String EXTRA_SHARE_TARGET = "share_target";

    protected abstract String getShareTarget();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        forwardShareIntent(getIntent());
        finish();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        forwardShareIntent(intent);
        finish();
    }

    private void forwardShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }

        String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (TextUtils.isEmpty(sharedText)) {
            return;
        }

        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setAction(Intent.ACTION_SEND);
        launchIntent.setType(intent.getType());
        launchIntent.putExtra(Intent.EXTRA_TEXT, sharedText);
        launchIntent.putExtra(EXTRA_SHARE_TARGET, getShareTarget());
        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        startActivity(launchIntent);
    }
}
