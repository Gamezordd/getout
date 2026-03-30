package com.getout.app;

import android.content.Intent;
import androidx.annotation.Nullable;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareLauncher")
public class ShareLauncherPlugin extends Plugin {

    @PluginMethod
    public void shareText(PluginCall call) {
        String text = call.getString("text");
        String title = call.getString("title");

        if (text == null || text.trim().isEmpty()) {
            call.reject("Missing share text.");
            return;
        }

        Intent sendIntent = new Intent(Intent.ACTION_SEND);
        sendIntent.setType("text/plain");
        sendIntent.putExtra(Intent.EXTRA_TEXT, text);

        @Nullable String chooserTitle = (title == null || title.trim().isEmpty()) ? null : title;
        Intent chooserIntent = Intent.createChooser(sendIntent, chooserTitle);
        chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getActivity().startActivity(chooserIntent);
            JSObject result = new JSObject();
            result.put("presented", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to open share sheet.", error);
        }
    }
}
