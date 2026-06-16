/**
 * This script sets up an incoming payment on a receiving wallet address,
 * and creates two outgoing payments on the sending wallet address.
 *
 * One of the steps will be asking for an outgoing payment grant for the sending wallet address.
 * Since this needs user interaction, you will need to navigate to the URL, and accept the interactive grant.
 *
 * To start, please add the variables for configuring the client & the wallet addresses for the payment.
 */

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

  // 2. Get wallet addresses
  const sendingWalletAddress = await client.walletAddress.get({
    url: SENDING_WALLET_ADDRESS_URL,
  });
  const receivingWalletAddress = await client.walletAddress.get({
    url: RECEIVING_WALLET_ADDRESS_URL,
  });

  console.log("Got wallet addresses", {
    receivingWalletAddress,
    sendingWalletAddress,
  });

  await promptNextStep();

  // 3. Get incoming payment grant
  const incomingPaymentGrant = await client.grant.request(
    {
      url: receivingWalletAddress.authServer,
    },
    {
      access_token: {
        access: [
          {
            type: "incoming-payment",
            actions: ["create"],
          },
        ],
      },
    },
  );

  if (!isFinalizedGrantWithAccessToken(incomingPaymentGrant)) {
    throw new Error("Expected finalized incoming payment grant");
  }

  console.log("Got incoming payment grant", incomingPaymentGrant);

  await promptNextStep();

  // 4. Create incoming payment on receiver's wallet address
  const totalAmount = 5000;

  const incomingPayment = await client.incomingPayment.create(
    {
      url: receivingWalletAddress.resourceServer,
      accessToken: incomingPaymentGrant.access_token.value,
    },
    {
      walletAddress: receivingWalletAddress.id,
      metadata: {
        description: "Book order",
      },
      incomingAmount: {
        assetCode: receivingWalletAddress.assetCode,
        assetScale: receivingWalletAddress.assetScale,
        value: totalAmount.toString(),
      },
    },
  );

  console.log("Created incoming payment", incomingPayment);

  await promptNextStep();

  // 5. Create & accept outgoing payment grant on sender's wallet address
  const outgoingPaymentGrant = await client.grant.request(
    {
      url: sendingWalletAddress.authServer,
    },
    {
      access_token: {
        access: [
          {
            type: "outgoing-payment",
            actions: ["create"],
            limits: {
              debitAmount: {
                assetCode: sendingWalletAddress.assetCode,
                assetScale: sendingWalletAddress.assetScale,
                value: totalAmount.toString(),
              },
            },
            identifier: sendingWalletAddress.id,
          },
        ],
      },
      interact: {
        start: ["redirect"],
      },
    },
  );

  if (!isPendingGrant(outgoingPaymentGrant)) {
    throw new Error("Expected pending grant");
  }

  console.log("Got pending outgoing payment grant", outgoingPaymentGrant);

  await promptNextStep();

  // 6. Continue outgoing payment grant
  const finalizedOutgoingPaymentGrant = await client.grant.continue({
    url: outgoingPaymentGrant.continue.uri,
    accessToken: outgoingPaymentGrant.continue.access_token.value,
  });

  if (!isFinalizedGrantWithAccessToken(finalizedOutgoingPaymentGrant)) {
    throw new Error("Expected finalized grant");
  }

  console.log(
    "Got finalized outgoing payment grant",
    finalizedOutgoingPaymentGrant,
  );

  await promptNextStep();

  // 7. Create first outgoing payment
  const outgoingPayment = await client.outgoingPayment.create(
    {
      url: sendingWalletAddress.resourceServer,
      accessToken: finalizedOutgoingPaymentGrant.access_token.value,
    },
    {
      walletAddress: sendingWalletAddress.id,
      incomingPayment: incomingPayment.id,
      debitAmount: {
        assetCode: sendingWalletAddress.assetCode,
        assetScale: sendingWalletAddress.assetScale,
        value: (totalAmount / 2).toString(),
      },
      metadata: {
        description: "First payment (for book one)",
      },
    },
  );

  console.log("Created outgoing payment", outgoingPayment);

  await promptNextStep();

  // 8. Create second outgoing payment
  const outgoingPayment2 = await client.outgoingPayment.create(
    {
      url: sendingWalletAddress.resourceServer,
      accessToken: finalizedOutgoingPaymentGrant.access_token.value,
    },
    {
      walletAddress: sendingWalletAddress.id,
      incomingPayment: incomingPayment.id,
      debitAmount: {
        assetCode: sendingWalletAddress.assetCode,
        assetScale: sendingWalletAddress.assetScale,
        value: (totalAmount / 2).toString(),
      },
      metadata: {
        description: "Second payment (for book two)",
      },
    },
  );

  console.log("Created second outgoing payment", outgoingPayment2);

  process.exit();
})();
