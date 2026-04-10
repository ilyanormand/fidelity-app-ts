import "@shopify/ui-extensions/preact";

export default function Login({ shopify }) {
    const s = shopify.settings?.current || {};
    const storefrontUrl = shopify.shop?.storefrontUrl ?? "";

    const title = s.loyalty_program_title || shopify.i18n.translate("loyaltyProgram");
    const message = s.login_message || shopify.i18n.translate("errors.joinAccount");
    const linkLabel = s.login_button || shopify.i18n.translate("components.login");
    const loginUrl = storefrontUrl
        ? new URL("/account/login", storefrontUrl).href
        : "/account/login";

    return (
        <s-stack gap="base">
            <s-text type="strong">{title}</s-text>

            <s-banner tone="info">
                <s-text>
                    {message}{" "}
                    <s-link href={loginUrl}>{linkLabel}</s-link>
                </s-text>
            </s-banner>
        </s-stack>
    );
}