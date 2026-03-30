package com.getout.app;

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

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
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
        GetSignInWithGoogleOption option =
            new GetSignInWithGoogleOption.Builder(serverClientId).build();
        GetCredentialRequest request =
            new GetCredentialRequest.Builder().addCredentialOption(option).build();

        credentialManager.getCredentialAsync(
            getActivity(),
            request,
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse result) {
                    handleCredentialResult(call, result);
                }

                @Override
                public void onError(GetCredentialException e) {
                    call.reject(e.getMessage(), e);
                }
            }
        );
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        if (getActivity() == null) {
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
                    call.resolve();
                }

                @Override
                public void onError(ClearCredentialException e) {
                    call.reject(e.getMessage(), e);
                }
            }
        );
    }

    private void handleCredentialResult(PluginCall call, GetCredentialResponse result) {
        Credential credential = result.getCredential();
        if (!(credential instanceof CustomCredential)) {
            call.reject("Unexpected credential type.");
            return;
        }

        CustomCredential customCredential = (CustomCredential) credential;
        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(customCredential.getType())) {
            call.reject("Unexpected Google credential type.");
            return;
        }

        try {
            GoogleIdTokenCredential googleIdTokenCredential =
                GoogleIdTokenCredential.createFrom(customCredential.getData());
            JSObject payload = new JSObject();
            payload.put("idToken", googleIdTokenCredential.getIdToken());
            call.resolve(payload);
        } catch (Exception e) {
            call.reject("Unable to parse Google ID token.", e);
        }
    }
}
