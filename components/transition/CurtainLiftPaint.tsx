/** Set by logout just before the hard redirect; read once by the next page. */
export const CURTAIN_LIFT_KEY = "ar_curtain_lift";

/**
 * The other half of the logout curtain.
 *
 * Logout closes two travelers over the app, then leaves with a full document
 * load (it has to: the server clears the cookies). The page that loads next
 * knew nothing about that, so the drape cut straight to its first paint. This
 * runs before that paint, the same trick as FirstRunPaint: if logout left the
 * flag, the document is marked and CSS (`html[data-curtain="lift"]`) opens the
 * same two halves off the new page. Nothing in React is involved, so there is
 * no frame between the drape and the lift for anything to show through.
 *
 * Every byte of the string is a compile-time constant; keep it that way.
 */
export function CurtainLiftPaint() {
  const js = `(function(){try{var k=${JSON.stringify(
    CURTAIN_LIFT_KEY,
  )};if(sessionStorage.getItem(k)==="1"){sessionStorage.removeItem(k);var d=document.documentElement;d.setAttribute("data-curtain","lift");setTimeout(function(){d.removeAttribute("data-curtain")},1600)}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
