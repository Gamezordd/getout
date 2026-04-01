package com.getout.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    private static String pendingShareText;
    private static String pendingShareTarget;

    public static void setPendingShare(String value, String target) {
        pendingShareText = value;
        pendingShareTarget = target;
    }

    @PluginMethod
    public void getPendingShare(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", pendingShareText);
        result.put("target", pendingShareTarget);
        call.resolve(result);
    }

    @PluginMethod
    public void clearPendingShare(PluginCall call) {
        pendingShareText = null;
        pendingShareTarget = null;
        call.resolve();
    }

    public void emitPendingShare(String value, String target) {
        JSObject result = new JSObject();
        result.put("text", value);
        result.put("target", target);
        notifyListeners("shareIntentReceived", result, true);
    }
}
