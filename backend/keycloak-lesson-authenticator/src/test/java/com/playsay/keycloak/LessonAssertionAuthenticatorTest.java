package com.playsay.keycloak;

import static org.mockito.Mockito.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.UriInfo;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.http.HttpRequest;
import org.keycloak.models.AuthenticatorConfigModel;
import org.keycloak.models.ClientModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.UserProvider;
import org.keycloak.sessions.AuthenticationSessionModel;

class LessonAssertionAuthenticatorTest {
    @Test
    void ignoresOrdinaryLoginWhenLessonAssertionIsAbsent() {
        var context = contextWithQuery(new MultivaluedHashMap<>());

        new LessonAssertionAuthenticator().authenticate(context);

        verify(context).attempted();
        verify(context, never()).setUser(any());
    }

    @Test
    void redeemsExactSubjectAndPropagatesRememberMeWithoutCredentialOperations() throws Exception {
        var server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/redeem", exchange -> {
            var token = exchange.getRequestHeaders().getFirst("X-PlaySay-Lesson-Provider-Token");
            var request = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            var accepted = "provider-secret".equals(token)
                && request.contains("\"handle\":\"assertion-1\"")
                && request.contains("\"clientId\":\"playsay-web\"")
                && request.contains("\"callback\":\"https://online.honey.school/auth/callback\"");
            var body = accepted ? "{\"subject\":\"student-1\",\"rememberMe\":true}" : "{}";
            exchange.sendResponseHeaders(accepted ? 200 : 400, body.length());
            exchange.getResponseBody().write(body.getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });
        server.start();
        try {
            var query = new MultivaluedHashMap<String, String>();
            query.add("lesson_assertion", "assertion-1");
            query.add("redirect_uri", "https://online.honey.school/auth/callback");
            var context = contextWithQuery(query);
            var authenticationSession = mock(AuthenticationSessionModel.class);
            var client = mock(ClientModel.class);
            when(client.getClientId()).thenReturn("playsay-web");
            when(authenticationSession.getClient()).thenReturn(client);
            when(context.getAuthenticationSession()).thenReturn(authenticationSession);
            var authenticatorConfig = new AuthenticatorConfigModel();
            authenticatorConfig.setConfig(Map.of(
                "redeemUrl", "http://127.0.0.1:" + server.getAddress().getPort() + "/redeem",
                "issuer", "https://auth.honey.school/realms/playsay",
                "providerToken", "provider-secret"
            ));
            when(context.getAuthenticatorConfig()).thenReturn(authenticatorConfig);
            var session = mock(KeycloakSession.class);
            var users = mock(UserProvider.class);
            var realm = mock(RealmModel.class);
            var user = mock(UserModel.class);
            when(user.isEnabled()).thenReturn(true);
            when(session.users()).thenReturn(users);
            when(context.getSession()).thenReturn(session);
            when(context.getRealm()).thenReturn(realm);
            when(users.getUserById(realm, "student-1")).thenReturn(user);

            new LessonAssertionAuthenticator(HttpClient.newHttpClient(), new ObjectMapper()).authenticate(context);

            verify(context).setUser(user);
            verify(authenticationSession).setAuthNote("remember_me", "true");
            verify(context).success();
            verify(user).isEnabled();
            verifyNoMoreInteractions(user);
        } finally {
            server.stop(0);
        }
    }

    private static AuthenticationFlowContext contextWithQuery(MultivaluedHashMap<String, String> query) {
        var context = mock(AuthenticationFlowContext.class);
        var request = mock(HttpRequest.class);
        var uri = mock(UriInfo.class);
        when(uri.getQueryParameters()).thenReturn(query);
        when(request.getUri()).thenReturn(uri);
        when(context.getHttpRequest()).thenReturn(request);
        return context;
    }
}
