package com.playsay.keycloak;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.provider.ProviderConfigProperty;

public final class LessonAssertionAuthenticator implements Authenticator {
    static final String ASSERTION_PARAMETER = "lesson_assertion";
    static final String REMEMBER_ME_NOTE = "remember_me";

    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public LessonAssertionAuthenticator() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build(), new ObjectMapper());
    }

    LessonAssertionAuthenticator(HttpClient httpClient, ObjectMapper objectMapper) {
        this.httpClient = httpClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public void authenticate(AuthenticationFlowContext context) {
        var assertion = context.getHttpRequest().getUri().getQueryParameters().getFirst(ASSERTION_PARAMETER);
        if (assertion == null || assertion.isBlank()) {
            context.attempted();
            return;
        }
        try {
            var config = LessonAssertionAuthenticatorFactory.configuration(context);
            var callback = context.getHttpRequest().getUri().getQueryParameters().getFirst("redirect_uri");
            var clientId = context.getAuthenticationSession().getClient().getClientId();
            var requestBody = objectMapper.writeValueAsString(Map.of(
                "handle", assertion,
                "clientId", clientId,
                "issuer", config.issuer(),
                "callback", callback
            ));
            var response = httpClient.send(
                HttpRequest.newBuilder(URI.create(config.redeemUrl()))
                    .timeout(Duration.ofSeconds(4))
                    .header("Content-Type", "application/json")
                    .header("X-PlaySay-Lesson-Provider-Token", config.providerToken())
                    .POST(HttpRequest.BodyPublishers.ofString(requestBody))
                    .build(),
                HttpResponse.BodyHandlers.ofString()
            );
            if (response.statusCode() != 200) {
                fail(context);
                return;
            }
            var redeemed = objectMapper.readValue(response.body(), RedeemedAssertion.class);
            UserModel user = context.getSession().users().getUserById(context.getRealm(), redeemed.subject());
            if (user == null || !user.isEnabled()) {
                fail(context);
                return;
            }
            context.setUser(user);
            if (redeemed.rememberMe()) {
                context.getAuthenticationSession().setAuthNote(REMEMBER_ME_NOTE, "true");
            }
            context.success();
        } catch (Exception ignored) {
            fail(context);
        }
    }

    private static void fail(AuthenticationFlowContext context) {
        context.failure(AuthenticationFlowError.INVALID_CREDENTIALS);
    }

    @Override public void action(AuthenticationFlowContext context) { fail(context); }
    @Override public boolean requiresUser() { return false; }
    @Override public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) { return true; }
    @Override public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) { }
    @Override public void close() { }

    record RedeemedAssertion(String subject, boolean rememberMe) { }
}
