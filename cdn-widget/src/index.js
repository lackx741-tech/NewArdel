import "./styles.css";
import { SweeperWidget } from "./SweeperWidget";

// Auto-initialize if data attribute exists
(function() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit);
  } else {
    autoInit();
  }

  function autoInit() {
    const scriptTag = document.querySelector(
      'script[data-delegate-address]'
    );
    
    if (scriptTag) {
      const config = {
        delegateAddress: scriptTag.getAttribute("data-delegate-address"),
        chainId: parseInt(scriptTag.getAttribute("data-chain-id") || "1"),
        theme: scriptTag.getAttribute("data-theme") || "light",
        position: scriptTag.getAttribute("data-position") || "bottom-right",
        rpcUrl: scriptTag.getAttribute("data-rpc-url"),
        apiKey: scriptTag.getAttribute("data-api-key"),
        autoStart: scriptTag.getAttribute("data-auto-start") !== "false"
      };

      new SweeperWidget(config);
    }
  }
})();

export { SweeperWidget };
export default SweeperWidget;
