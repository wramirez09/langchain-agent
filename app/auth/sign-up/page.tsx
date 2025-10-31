

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient p-6">
      <div className="w-full max-w-md">
        <div className="hidden md:block text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 text-shadow-lg">Create an account</h1>
          <p className="text-dark">Enter your details to get started</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-8">
          {/* <SignUpForm /> */}
          <script async
            src="https://js.stripe.com/v3/buy-button.js">
          </script>

          <script async
            src="https://js.stripe.com/v3/buy-button.js">
          </script>

          <stripe-buy-button
            buy-button-id="buy_btn_1SO6nM18T9D12Q337i2vgqh1"
            publishable-key="pk_test_51SNhn918T9D12Q33Y5C7vRshMxW2p3dbR9xvTfUAnuF37jaUGilnd8bFWuMLQcQq5enQxPDXLCbKOF7EQUEQgvq4007DqMXHtB"
          >
          </stripe-buy-button>
        </div>
      </div>
    </div>
  );
}
