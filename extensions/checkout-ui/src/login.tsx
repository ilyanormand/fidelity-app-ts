import "@shopify/ui-extensions/preact";

export default function Login({ shopify }) {
    const s = shopify.settings?.current || {};

    const title = s.loyalty_program_title || shopify.i18n.translate("loyaltyProgram");
    const message = s.login_message || shopify.i18n.translate("errors.joinAccount");
    const buttonLabel = s.login_button || shopify.i18n.translate("components.login");

    return (
        <s-stack gap="base">
            <s-text type="strong">{title}</s-text>

            <s-banner tone="info">
                <s-text>{message}</s-text>
            </s-banner>

            <s-button
                variant="primary"
                href="/account/login"
                tone="neutral"
            >
                {buttonLabel}
            </s-button>
        </s-stack>
    );
}