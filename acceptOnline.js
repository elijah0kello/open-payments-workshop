import {
    createAuthenticatedClient,
    isFinalizedGrantWithAccessToken,
    isPendingGrant,
} from "@interledger/open-payments";
import readline from "readline/promises";

(async () => {
    const readlineInterface = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const promptNextStep = () =>
        readlineInterface.question(`\nPress enter for next step...\n`);

    // Client configuration
    const PRIVATE_KEY_PATH = "private.key";
    const KEY_ID = "3f9073de-53c3-4c65-b149-2acb09f479f5";

    // Make sure the wallet addresses starts with https:// (not $)
    const CLIENT_WALLET_ADDRESS_URL = "https://ilp.interledger-test.dev/rabbits";
    const SENDING_WALLET_ADDRESS_URL = "https://ilp.interledger-test.dev/chris-baryo";
    const RECEIVING_WALLET_ADDRESS_URL = "https://ilp.interledger-test.dev/galactic-mouse";

    // 1. Create client

    const client = await createAuthenticatedClient({
        walletAddressUrl: CLIENT_WALLET_ADDRESS_URL,
        keyId: KEY_ID,
        privateKey: PRIVATE_KEY_PATH,
    });

    console.log("Initialized client", {
        CLIENT_WALLET_ADDRESS_URL,
    });

    await promptNextStep();

    // Get Wallet Addresses
    const customerWalletAddress = await client.walletAddress.get({
        url: SENDING_WALLET_ADDRESS_URL
    })
    const retailerWalletAddress = await client.walletAddress.get({
        url: RECEIVING_WALLET_ADDRESS_URL
    })

    console.log("Got wallet addresses", {
        customerWalletAddress,
        retailerWalletAddress,
    });

    await promptNextStep();

    // 3. Get incoming payment grant
    const retailerIncomingPaymentGrant = await client.grant.request(
        {
            url: retailerWalletAddress.authServer
        },
        {
            access_token: {
                access: [
                    {
                        type: 'incoming-payment',
                        actions: ['create']
                    }
                ]
            }
        }
    )

    if (!isFinalizedGrantWithAccessToken(retailerIncomingPaymentGrant)) {
        throw new Error('Expected finalized grant')
    }

    console.log("Got incoming payment grant", retailerIncomingPaymentGrant);

    await promptNextStep();

    // Create an incoming payment
    const retailerIncomingPayment = await client.incomingPayment.create(
        {
            url: retailerWalletAddress.resourceServer,
            accessToken: retailerIncomingPaymentGrant.access_token.value
        },
        {
            walletAddress: retailerWalletAddress.id,
            incomingAmount: {
                value: '140000',
                assetCode: 'EGG',
                assetScale: 2
            }
        }
    )

    console.log("Created incoming payment", retailerIncomingPayment);

    await promptNextStep();

    // Create a quote grant 
    const customerQuoteGrant = await client.grant.request(
        {
            url: customerWalletAddress.authServer
        },
        {
            access_token: {
                access: [
                    {
                        type: 'quote',
                        actions: ['create']
                    }
                ]
            }
        }
    )

    if (!isFinalizedGrantWithAccessToken(customerQuoteGrant)) {
        throw new Error('Expected finalized grant')
    }

    console.log("Got quote grant", customerQuoteGrant);

    await promptNextStep();

    // Create a quote
    const customerQuote = await client.quote.create(
        {
            url: customerWalletAddress.resourceServer,
            accessToken: customerQuoteGrant.access_token.value
        },
        {
            method: 'ilp',
            walletAddress: customerWalletAddress.id,
            receiver: retailerIncomingPayment.id
        }
    )

    console.log("Created quote", customerQuote);

    await promptNextStep();

    // Create an interactive outgoing payment grant
    const pendingCustomerOutgoingPaymentGrant = await client.grant.request(
        {
            url: customerWalletAddress.authServer
        },
        {
            access_token: {
                access: [
                    {
                        identifier: customerWalletAddress.id,
                        type: 'outgoing-payment',
                        actions: ['create'],
                        limits: {
                            debitAmount: {
                                assetCode: 'EGG',
                                assetScale: 2,
                                value: '140000'
                            }
                        }
                    }
                ]
            },
            interact: {
                start: ['redirect']
            }
        }
    )

    if (!isPendingGrant(pendingCustomerOutgoingPaymentGrant)) {
        throw new Error('Expected pending/interactive grant')
    }

    console.log("Got pending outgoing payment grant", pendingCustomerOutgoingPaymentGrant);

    await promptNextStep();

    // Continue the outgoing payment grant
    const customerOutgoingPaymentGrant = await client.grant.continue({
        url:
            pendingCustomerOutgoingPaymentGrant.continue.uri,
        accessToken: pendingCustomerOutgoingPaymentGrant.continue.access_token.value,
    });

    if (!isFinalizedGrantWithAccessToken(customerOutgoingPaymentGrant)) {
        throw new Error("Expected finalized grant");
    }

    console.log(
        "Got finalized outgoing payment grant",
        customerOutgoingPaymentGrant,
    );

    await promptNextStep();

    // Create an outgoing payment
    const customerOutgoingPayment = await client.outgoingPayment.create(
        {
            url: customerWalletAddress.resourceServer,
            accessToken: customerOutgoingPaymentGrant.access_token.value
        },
        {
            walletAddress: customerWalletAddress.id,
            quoteId: customerQuote.id
        }
    )

    console.log("Created outgoing payment", customerOutgoingPayment);
    
    await promptNextStep();

    console.log("Payment completed successfully!");

    process.exit(0);

})();