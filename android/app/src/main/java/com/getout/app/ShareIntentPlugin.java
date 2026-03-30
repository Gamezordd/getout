package com.getout.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    private static String pendingShareText;

    public static void setPendingShareText(String value) {
        pendingShareText = value;
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pendingShareText);
        call.resolve(result);
    }

    @PluginMethod
    public void clearPendingShare(PluginCall call) {
        pendingShareText = null;
        call.resolve();
    }

    public void emitPendingShare(String value) {
        JSObject result = new JSObject();
        result.put("text", value);
        notifyListeners("shareIntentReceived", result, true);
    }
}
