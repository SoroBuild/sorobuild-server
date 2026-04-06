// Build Stellar operations using Sorobuild script context
// Available globals: Operation, Asset
//GCO46X6FYMR7MNIDWEFPHJUC4NRUDBDPPHFM4QTEIQE72JYC3DHSCH2P

operations = [
  Operation.createAccount({
    destination: "GCO46X6FYMR7MNIDWEFPHJUC4NRUDBDPPHFM4QTEIQE72JYC3DHSCH2P",
    startingBalance: "0",
  }),
  Operation.payment({
    destination: "GCO46X6FYMR7MNIDWEFPHJUC4NRUDBDPPHFM4QTEIQE72JYC3DHSCH2P",
    asset: Asset.native(),
    amount: "50",
  }),
];
