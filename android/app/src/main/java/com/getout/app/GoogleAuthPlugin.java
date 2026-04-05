package com.getout.app;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.CapacitorCookieManager;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    private static final String MOBILE_AUTH_PATH = "/api/auth/mobile/google";

    private interface IdTokenSuccessHandler {
        void onToken(String idToken) throws Exception;
    }

    @PluginMethod
    public void signIn(PluginCall call) {
        requestIdToken(
            call,
            true,
            idToken -> bootstrapServerSession(call, idToken),
            false
        );
    }

    @PluginMethod
    public void restoreSession(PluginCall call) {
        requestIdToken(
            call,
            false,
            idToken -> bootstrapServerSession(call, idToken),
            true
        );
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        if (getActivity() == null) {
            clearSessionCookies();
            call.resolve();
            return;
        }

        CredentialManager credentialManager = CredentialManager.create(getContext());
        credentialManager.clearCredentialStateAsync(
            new ClearCredentialStateRequest(),
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<Void, ClearCredentialException>() {
                @Override
                public void onResult(Void unused) {
                    clearSessionCookies();
                    call.resolve();
                }

                @Override
                public void onError(ClearCredentialException e) {
                    call.reject(e.getMessage(), e);
                }
            }
        );
    }

    private void requestIdToken(
        PluginCall call,
        boolean interactive,
        IdTokenSuccessHandler onSuccess,
        boolean resolveSignedOutOnMissingCredential
    ) {
        if (getActivity() == null) {
            call.reject("Missing activity.");
            return;
        }

        String serverClientId = getContext().getString(R.string.google_auth_server_client_id);
        if (serverClientId == null || serverClientId.trim().isEmpty()) {
            call.reject("Missing google_auth_server_client_id.");
            return;
        }

        CredentialManager credentialManager = CredentialManager.create(getContext());
        GetCredentialRequest request = buildCredentialRequest(serverClientId, interactive);

        credentialManager.getCredentialAsync(
            getActivity(),
            request,
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    try {
                        String idToken = extractIdToken(result);
                        onSuccess.onToken(idToken);
                    } catch (Exception e) {
                        call.reject(e.getMessage(), e);
                    }
                }

                @Override
                public void onError(GetCredentialException e) {
                    if (resolveSignedOutOnMissingCredential && e instanceof NoCredentialException) {
                        JSObject result = new JSObject();
                        result.put("authenticated", false);
                        call.resolve(result);
                        return;
                    }
                    call.reject(e.getMessage(), e);
                }
            }
        );
    }

    @NonNull
    private GetCredentialRequest buildCredentialRequest(String serverClientId, boolean interactive) {
        GetCredentialRequest.Builder builder = new GetCredentialRequest.Builder();

        if (interactive) {
            GetSignInWithGoogleOption option =
                new GetSignInWithGoogleOption.Builder(serverClientId).build();
            builder.addCredentialOption(option);
            return builder.build();
        }

        GetGoogleIdOption option = new GetGoogleIdOption.Builder()
            .setServerClientId(serverClientId)
            .setFilterByAuthorizedAccounts(true)
            .setAutoSelectEnabled(true)
            .build();
        builder.addCredentialOption(option);
        return builder.build();
    }

    private String extractIdToken(GetCredentialResponse result) {
        Credential credential = result.getCredential();
        if (!(credential instanceof CustomCredential)) {
            throw new IllegalStateException("Unexpected credential type.");
        }

        CustomCredential customCredential = (CustomCredential) credential;
        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
            throw new IllegalStateException("Unexpected Google credential type.");
        }

        GoogleIdTokenCredential googleIdTokenCredential =
            GoogleIdTokenCredential.createFrom(customCredential.getData());
        String idToken = googleIdTokenCredential.getIdToken();
        if (idToken == null || idToken.trim().isEmpty()) {
            throw new IllegalStateException("Missing Google ID token.");
        }
        return idToken;
    }

    private void bootstrapServerSession(PluginCall call, String idToken) {
        execute(() -> {
            HttpURLConnection connection = null;

            try {
                String serverUrl = getBridge().getServerUrl();
                if (serverUrl == null || serverUrl.trim().isEmpty()) {
                    throw new IllegalStateException("Missing Capacitor server URL.");
                }

                URL url = new URL(buildEndpointUrl(serverUrl));
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("x-capacitor-platform", "android-native");

                JSONObject requestBody = new JSONObject();
                requestBody.put("idToken", idToken);
                byte[] bodyBytes = requestBody.toString().getBytes(StandardCharsets.UTF_8);

                try (OutputStream outputStream = connection.getOutputStream()) {
                    outputStream.write(bodyBytes);
                }

                int statusCode = connection.getResponseCode();
                String responseBody = readResponseBody(
                    statusCode >= 200 && statusCode < 300
                        ? connection.getInputStream()
                        : connection.getErrorStream()
                );
                JSONObject responseJson = responseBody.isEmpty()
                    ? new JSONObject()
                    : new JSONObject(responseBody);

                if (statusCode < 200 || statusCode >= 300) {
                    String message = responseJson.optString(
                        "message",
                        "Unable to authenticate with Google."
                    );
                    throw new IllegalStateException(message);
                }

                installCookies(url.toURI(), connection.getHeaderFields());

                JSObject result = new JSObject();
                result.put("authenticated", true);
                if (responseJson.has("user") && !responseJson.isNull("user")) {
                    result.put("user", new JSObject(responseJson.getJSONObject("user").toString()));
                }

                getBridge().executeOnMainThread(() -> call.resolve(result));
            } catch (Exception e) {
                String message = e.getMessage() != null
                    ? e.getMessage()
                    : "Unable to authenticate with Google.";
                getBridge().executeOnMainThread(() -> call.reject(message, e));
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }

    private String buildEndpointUrl(String serverUrl) {
        String normalizedServerUrl = serverUrl.endsWith("/")
            ? serverUrl.substring(0, serverUrl.length() - 1)
            : serverUrl;
        return normalizedServerUrl + MOBILE_AUTH_PATH;
    }

    private void installCookies(URI uri, Map<String, List<String>> responseHeaders) throws IOException {
        CapacitorCookieManager cookieManager = new CapacitorCookieManager(getBridge());
        cookieManager.put(uri, responseHeaders);
        cookieManager.flush();
    }

    private void clearSessionCookies() {
        CapacitorCookieManager cookieManager = new CapacitorCookieManager(getBridge());
        cookieManager.removeAllCookies();
        cookieManager.flush();
    }

    @NonNull
    private String readResponseBody(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        try (
            InputStreamReader inputStreamReader = new InputStreamReader(stream, StandardCharsets.UTF_8);
            BufferedReader reader = new BufferedReader(inputStreamReader)
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }
}
