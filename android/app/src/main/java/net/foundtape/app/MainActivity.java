package net.foundtape.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

/**
 * Das Spiel liegt vollständig in den Assets. Es wird über einen lokalen
 * https-Ursprung ausgeliefert (statt über file://), damit Fetch, Service
 * Worker und WebGL-Texturen ohne Sonderrechte funktionieren.
 */
public class MainActivity extends Activity {

  private WebView web;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
        .setDomain("appassets.androidplatform.net")
        .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
        .build();

    web = new WebView(this);
    web.setBackgroundColor(0xFF000000);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setAllowContentAccess(false);
    s.setSupportZoom(false);
    s.setBuiltInZoomControls(false);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      s.setSafeBrowsingEnabled(false);   // es wird nichts aus dem Netz geladen
    }

    web.setWebViewClient(new WebViewClient() {
      @Override
      public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        WebResourceResponse res = loader.shouldInterceptRequest(request.getUrl());
        /* Ebene 1 lädt über ES-Module. Die verlangen einen JavaScript-Medientyp;
           was Android aus der Dateiendung errät, ist je nach Fassung "text/plain"
           - dann verweigert die WebView das Modul. Hier wird er festgelegt. */
        if (res != null) {
          String pfad = request.getUrl().getPath();
          if (pfad != null && (pfad.endsWith(".js") || pfad.endsWith(".mjs"))) {
            res = new WebResourceResponse("text/javascript", "utf-8", res.getData());
          }
        }
        return res;
      }
    });

    FrameLayout root = new FrameLayout(this);
    root.addView(web, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    setContentView(root);

    web.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
  }

  /** Randlos: Statusleiste und Navigationsleiste verschwinden. */
  private void immersive() {
    View d = getWindow().getDecorView();
    d.setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
      | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
      | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
      | View.SYSTEM_UI_FLAG_FULLSCREEN
      | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) immersive();
  }

  @Override
  protected void onPause() {
    super.onPause();
    if (web != null) web.onPause();
  }

  @Override
  protected void onResume() {
    super.onResume();
    if (web != null) web.onResume();
    immersive();
  }

  @Override
  public void onBackPressed() {
    if (web != null && web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }
}
