import { Amplify } from "aws-amplify";
import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { awsConfig } from "./aws-config";

Amplify.configure(awsConfig);

function App() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div style={{ padding: 40, fontFamily: "sans-serif" }}>
          <h1>Hello, {user?.signInDetails?.loginId}!</h1>
          <p>You are logged in.</p>
          <button onClick={signOut}>Sign out</button>
        </div>
      )}
    </Authenticator>
  );
}

export default App;