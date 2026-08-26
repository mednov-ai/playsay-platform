package com.playsay.keycloak;

import java.util.List;
import org.keycloak.Config;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.models.AuthenticationExecutionModel;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.provider.ProviderConfigProperty;

public final class LessonAssertionAuthenticatorFactory implements AuthenticatorFactory {
    public static final String ID = "playsay-lesson-assertion";
    private static final String REDEEM_URL = "redeemUrl";
    private static final String ISSUER = "issuer";
    private static final String PROVIDER_TOKEN = "providerToken";
    private static final Authenticator AUTHENTICATOR = new LessonAssertionAuthenticator();

    @Override public String getId() { return ID; }
    @Override public String getDisplayType() { return "Honey School lesson assertion"; }
    @Override public String getHelpText() { return "Redeems a one-time, subject-bound lesson assertion without accessing credentials."; }
    @Override public String getReferenceCategory() { return "Honey School"; }
    @Override public boolean isConfigurable() { return true; }
    @Override public boolean isUserSetupAllowed() { return false; }
    @Override public Authenticator create(KeycloakSession session) { return AUTHENTICATOR; }
    @Override public void init(Config.Scope config) { }
    @Override public void postInit(KeycloakSessionFactory factory) { }
    @Override public void close() { }
    @Override public AuthenticationExecutionModel.Requirement[] getRequirementChoices() {
        return new AuthenticationExecutionModel.Requirement[] {
            AuthenticationExecutionModel.Requirement.ALTERNATIVE,
            AuthenticationExecutionModel.Requirement.DISABLED
        };
    }

    @Override
    public List<ProviderConfigProperty> getConfigProperties() {
        return List.of(
            property(REDEEM_URL, "Redemption URL", "Internal registration-service assertion redemption URL", ProviderConfigProperty.STRING_TYPE, ""),
            property(ISSUER, "Environment issuer", "Exact Keycloak issuer bound into the assertion", ProviderConfigProperty.STRING_TYPE, ""),
            property(PROVIDER_TOKEN, "Provider token", "Dedicated server-to-server redemption token", ProviderConfigProperty.PASSWORD, "")
        );
    }

    static Configuration configuration(AuthenticationFlowContext context) {
        var values = context.getAuthenticatorConfig() == null ? java.util.Map.<String, String>of() : context.getAuthenticatorConfig().getConfig();
        var configuration = new Configuration(values.get(REDEEM_URL), values.get(ISSUER), values.get(PROVIDER_TOKEN));
        if (configuration.redeemUrl() == null || configuration.redeemUrl().isBlank()
            || configuration.issuer() == null || configuration.issuer().isBlank()
            || configuration.providerToken() == null || configuration.providerToken().isBlank()) {
            throw new IllegalStateException("Lesson assertion authenticator is not configured");
        }
        return configuration;
    }

    private static ProviderConfigProperty property(String name, String label, String help, String type, Object defaultValue) {
        var property = new ProviderConfigProperty();
        property.setName(name);
        property.setLabel(label);
        property.setHelpText(help);
        property.setType(type);
        property.setDefaultValue(defaultValue);
        return property;
    }

    record Configuration(String redeemUrl, String issuer, String providerToken) { }
}
