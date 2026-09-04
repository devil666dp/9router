// Deterministic media fixtures for the capability probes (see ./probes.js).
//
// Each fixture embeds a value the model can only report back by actually reading the
// medium, so a pass means the provider decoded it — not merely that it answered 200.
// Guessing a specific 4-digit number is a 1-in-10000 shot, which keeps false positives
// negligible without a second round-trip.
//
// How each was generated (all four are tiny and reproducible):
//   image 598 B — "4827" drawn with a 3x5 pixel font by a hand-rolled PNG encoder
//   pdf   578 B — one Helvetica page reading "3141", written as raw PDF objects
//   audio 3681 B — ffmpeg -f lavfi -i "flite=text='six one nine two':voice=slt" -c:a libmp3lame -b:a 16k -ar 16000 -ac 1
//   video 1948 B — ffmpeg -loop 1 -i <"5193" png> -t 1 -r 2 -c:v libx264 -crf 30 -pix_fmt yuv420p
//
// Keep them small: every probe inlines its fixture as base64 in the request body.

export const PROBE_FIXTURES = {
  image: {
    mime: "image/png",
    expect: "4827",
    b64:
    "iVBORw0KGgoAAAANSUhEUgAAAS4AAAB6CAIAAACOSilBAAACHUlEQVR42u3TUQGEMBBDwVqof7HgoR9hSecZ6IXbWY+kAS2f" +
    "QEJREooSipJQlFCUhKKEoiQUJRQloSihKAlFCUVJKEpXUdxHnf24+W8ls6t7F4pO1i4UUbTLLhSdrF0oomiXXSg6WbtQRNHJ" +
    "2oWik7ULRRSdrF0oOlm7UETRydqFopO1C0UUnaxdKPpr7UIRRSdrF4r+WrtQRNHJ2oWiv9YuFFGc/1Yyu1D0Fooo4uFk7ULR" +
    "WyiiiAeKdqHoLRRRxANFu1D0lpNFEQ8U7ULRW04WRTxQtAtFbzlZFPFA0S4UveVkUcQDRRRR9JaTRREPFFFE0VtOFsXMz0qW" +
    "/Nx2fbULRSdrF4ooOlm7UHSydqGIopO1C0UnaxeKKDpZu1B0snahiKKTtQtFJ2sXiig6WbtQdLJ2oYiik7ULRRTtQhFFJ2sX" +
    "iijahSKKTtYuFFG0C8UOin2fwFt/5NH3NVD0Fooo4oEiiih6C0UU8UARRRS9hSKKThZFFFH0Fooooogiiih6C0UUUUQRRRS9" +
    "hSKKKKLoolDEA0UUUUQRRRTxQBFFFL2FIop4oIgiisnsQhFFFFFE0cnahSKKKKKIIop2oYgiiiiiiKJdKKKIIoooomgXiiii" +
    "iCKKKNqFIooooogiinahiCKKKKKIIooooogiiiiiiCKKKKKIIoqSUJRQlISihKIkFCUUJaEooSgJRQlFSShKKEpCUUJREopS" +
    "fS+fx/LdEaDktQAAAABJRU5ErkJggg==",
  },
  pdf: {
    mime: "application/pdf",
    expect: "3141",
    b64:
    "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5" +
    "cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVu" +
    "dCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMTIwXSAvUmVzb3VyY2VzIDw8IC9Gb250IDw8IC9GMSA1IDAgUiA+PiA+PiAv" +
    "Q29udGVudHMgNCAwIFIgPj4KZW5kb2JqCjQgMCBvYmoKPDwgL0xlbmd0aCAzNCA+PgpzdHJlYW0KQlQgL0YxIDQ4IFRmIDI0" +
    "IDQwIFRkICgzMTQxKSBUaiBFVAplbmRzdHJlYW0KZW5kb2JqCjUgMCBvYmoKPDwgL1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5" +
    "cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhID4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAw" +
    "MDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAwMTE1IDAwMDAwIG4gCjAwMDAwMDAyNDEgMDAwMDAgbiAK" +
    "MDAwMDAwMDMyNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDYgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjM5NQolJUVP" +
    "Rgo=",
  },
  audio: {
    mime: "audio/mpeg",
    format: "mp3",
    expect: "6192",
    spoken: "six one nine two",
    b64:
    "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjYwLjE2LjEwMAAAAAAAAAAAAAAA//NYwAAAAAAAAAAAAEluZm8AAAAPAAAAMAAA" +
    "DjQAEREWFhsbICAmJisrMDA1NTo6Pz9ERElJTk5OU1NYWF1dYmJnZ2xscnJ3d3x8gYGGhouLi5CQlZWamp+fpKSpqa6us7O5" +
    "ub6+w8PIyMjNzdLS19fc3OHh5ubr6/Dw9fX6+v//AAAAAExhdmM2MC4zMQAAAAAAAAAAAAAAACQC8AAAAAAAAA40yAr0VwAA" +
    "AAAAAAAAAAAA//MoxAAMmDYoADJMIE7OAAskCDCYQTOIKORAAyAfPjT9YP9f/SICchB+/0/36z/LlyBPkMo45Ll/+Q1anBjD" +
    "6icA4NowPAoD//MoxAgNIDJQAEpSAMNpoBI9rATUD9pS7If/UUF0oOcuOUcWH75Bf3LKISQDFgkTdX9aMz6/ifxe2gDFG50J" +
    "IgsHNgiIQJSI//MoxA4I2B5hthJEACkUTuZr+hd3X94p/6P/b/8d///+3XUACaX73WWOcQzo0ONr6lJ7WKfput3/v9lS7P7B" +
    "qNCbddn+rf////MoxCUKMB5yXhGCAH+6py0tmwEzXGKHKCwHLBZIqotQz/7v+vr1LefoX2OWSXa5ePC8q+9TSTGCiUPqc3tf" +
    "TR9Y9QHLbQPz//MoxDcMYCZIAGPSAB//////////4OQAYDB3ZZ42Y3jx872fWbD1h6BZNs7ZaBNjFMg9+//d3+eTY8mmTJ5H" +
    "LJkwu62D1gBG//MoxEAWyxqAHgmZyD7H6QkszP16+9EMntOHAgCIiWQAIAYTEMtnDioP/wS90a9f/06JbtvQQzqEIcAIMaM5" +
    "mIUzq3JQjOvz//MoxB8Rsx6UFACZjNRildv0dPtXYjpFlaa9eYIZyYYX0JyYH4aXQmG0g6H64uIbRPFDiLIAOQXbULSHiJJf" +
    "/yqS6ZmvyTt1//MoxBMRGyalvABKnEUKdkQxxd4o7n////+qK7u6o5DLJo+7IZMuv5T2Vvrb9f+xkMlhc7hQduLBwPB8PirV" +
    "m+2/m2sJwAWu//MoxAkPSHLGXBawBG2xK9M/BOKrFh8gh9uAMAEAiN/soWHQ7G5iTE/KMaByLeXesnqOZTY2TBDL4qF3/y+t" +
    "+zWqP///9P40//MoxAYOCULRkAYKGKH6hxo1dlNOm0CgurYjerggku2Q4X+Ta60bif4h9P0/L+P9AmivQQDDzCnP1AlkH1N0" +
    "1ZA5IXn/3UrY//MoxAgOcY7NEMMKiBg8VrXatdmUiv5BYeAyzXHrDisDrcBW9yt5n/+j/R/o6HKYPCJC1QW8pHpUSF8s/PZZ" +
    "DwA9u7AHzrBf//MoxAkM4Ha0f08YAJBCSoF9WzC6fXrh83T1//3Vxn//1f8kHZ4NKeHRKRg1JB3O9yI1yiu//tWl0XWIC6Ig" +
    "k+6QFv6L3+cz//MoxBAPwW6oAYIQACCEOohf1Z4QDlMcKX+WRbso4oeVp0hgOqEp0lIM+oHzyddFKn/x5lFg0pHMjwybAkmu" +
    "H9JJQMH7I0z1//MoxAwNIGa6X8IQAJwBnIcigyO6BpK4rcntK5oeZGqsYxNna9eqjc5TaiWr///vbWmgQLkFAAEtGGkj4g0Q" +
    "UkoVXWAgTDPj//MoxBIMgGLSXABGhoUlQhsBWCoKrCZgRBwRA0eZ/fd1Gw6SXK53f/oxv//vAkloAutz8D9psuSMqIu99K6M" +
    "hD10fo26Kcy1//MoxBsMiYLSXAgEyi6A1f6rijJf+wkrAtuz9CTBDcJav/61KirJLJJIGH5AHMkdDjGQFKDIHdYm5aHAwYAa" +
    "tauxiuvBQQVd//MoxCMM4KrKWC7KMo6AGL+sk71D79+U9ZEl//lqH///AO/9rk2YdCEAix2DLbtwUYFSlMMzdWZfAxGhYxlf" +
    "s7AmQESt97gN//MoxCoMuKq1kN5eTKl93tiindkLHXyHAgzFDEjv3MK63q3ceYxBSbq3fqR9BOCKyX5QNrLp5QBwNTOn8m/s" +
    "qEHf/////5zp//MoxDIMgNbAAC5WNCAwO/OHdZuCaWne5KOzGkYii/MCeOdzRFNb9sHmkW50w+GcreQE7oX8RwVD2n//+/MN" +
    "/yTvaSnfAkIn//MoxDsM+PLZkoKScPUUBxWM07uCEQ6mdG6EVPOWwOg+hu7a1mW5QKnh18s+WNVhr//6/wV+WgI1tttotQA4" +
    "8YCQQgPhZsSg//MoxEIMMLqwANMKjCppak/Z/G5Kw0ELRmY3fS+Tj3mDaPr57fi/16u/7v//33OXADP/csA7925pYIyVu172" +
    "dG3SL/OFkgtP//MoxEwM+LbBvg5aEO8WsEAacFk6ENqd+cW6onUcx2c+3/9PxO/D9dJ/YD75BaBmVA0YoPqMSM6zENQPomyj" +
    "EsiAZ/rIh7IE//MoxFMM+LbFlMGEjON5OINZI3ZOqUk1Nd0X9Jv/+d6zBz+wiHTXv22/+t0iTb+Uh61AAZbMPEYt/5D7cfhU" +
    "WQ7hUARj56FL//MoxFoPadK8AJgFofhC/YIjfKgNJ2PiMD8mNHB3EH7/k9OrLE6w3pUUN6hOyMDqUagnS8MNAUOdHGyLl54U" +
    "VEugPy3iYutl//MoxFcN4Q7VkmrOWGExf0f6P8ef5fn859X7dH/4spK1MQVY7u+QQetQMBaxPFtHFuMXeaVTgldb/hoKiC1w" +
    "4RT3uC46fgg3//MoxFoMoSriTGrOTCz/ksr35rd/U9UIJaS67NKAO5PECFNViUgNXZ1CEMEzWe6QBZZ7yws/L6QGWc32s/PZ" +
    "3Z/zue/2Nkbk//MoxGIMELri+DvQNOtoJ3b/AfYbgVrwmgtukNBH95Ksa0W2+uma+kVnL3FB2V//57BpXysFY5486pu3//+e" +
    "W3nlGUFaMqpI//MoxGwMgLLyXGsSTv5hg8cz6HysgWA2EUClU8saX2cutJi1pH/////9ZUJ3Hr3f/+pGsVYVP47b/YoBV0Yg" +
    "Az/nTACLdpBp//MoxHUM4Jb6XmvEilXRg0RZPSdP7////9F/9Gbug06m4xM+1rVRRGLlFgIKaGIooc5zq/zuKGGDRjkuxQ+O" +
    "lXdDOKmGNYk+//MoxHwM2E6IDVsQAHdmfIp5JzLA4dQXkIHzsOZhUUFQpAAqKvl22sC0D/oIAI6wAplCHBsEEiADI4wNCrmC" +
    "y5bt1SewPvJq//MoxIMXkyK1lYUoADn/SsQuRDppZmz9X6M7E/+9uAFJ28Rm0aJq4d/hKfPXREQBTNvm8MKdFgzIm0/Chv5/" +
    "1f//D8yIgiXf//MoxF8MeE7hvcMYAgHerbt2Kga66rbUAN1AqIUIv2/tqhA7lNDj6U6qIO8WfLZRYBi/b7+j+n1+3/p9/VvC" +
    "5TIZL///+3fV//MoxGgMiGLOWAY0BEKGFv/8ACAc/KGOpWnPgD/ZrxcqQ9y0/iSinVRJJudV5g/m/rfyYadAuPQQHACsVyuW" +
    "yH///94GLGuz//MoxHANCVrKWAZEFFgA+0oJZCK7az+LehjP2pLE9VTHAAgS5QA1ureUZOEjaiOp8wqAfPacLegjHQjG5IoC" +
    "n5ygC0W5ffit//MoxHYNuRLWXAvaEGSZsJ7V0kos4cKLngzFDcqG9LlZ7VHf0DEjdZ6otYJWf/ry2RUBGiy22gUUAeWQQKRi" +
    "v+9MATVRah0F//MoxHoMORb2WAPOFpoTxXTygESXoFN4x9QXjzTThkJry2V+3//2f//++hWFY33hQ5GpbBftP10mahdoJ+da" +
    "drylKooAeh+q//MoxIQMoM7BuA4aEFuAFRLWqrVf7/0SS6/IVs///69u3//2VakLT//j8fgVO4mYoTGmisTMf6kGNg4Vf1AS" +
    "kRm9YGHJwLba//MoxIwNEL6+XqPUMMNQF/+1Tl3oYr0f/+pf///QJoEtklALAQztFK7////k4YaOhI9E5sFFLMGfGvOLQU/+" +
    "2cLOuf/nGV2m//MoxJINMKKEAN5WTFRwuTG1fh5p6lA4NAWFijRf+7dXtf9LHm3dmRVL//0Tv9d1qy9VQo6g7EVlXzwANKed" +
    "t//56si1BgDw//MoxJgMuKq1HgPGCDkbkAcccQDX+VjDRYS/+QKjjoseAR2GmPzeDRv/kURigQcXvUlLBEWY5LFPVR//hRQ9" +
    "CEUoA9dK8Clu//MoxKALmDK5XgCEAgPINyu/XSrL//3eVkzGQ///9mJR0MVAoQ86gpaay6Io/DlsjDCUWpUAByJquVpqcIQc" +
    "mDgoZMolWRtu//MoxKwMsdKACjgFJMfSVp13/UsJ6t/FO6//6adxZZL+tyrf/q9nUm6sEAQCUFZ6LkYQvS0mEgJDUqdJaGW3" +
    "bb/w81f36VL+//MoxLQNMDKlngAGAl2a0dlcb2d1j9Lf7bKeP0U1SidIAGB02BFhINBYVmHAWxlBVBOhuukMPyXzVm7Q30SP" +
    "693Gi3/yMr0///MoxLoMEgZ4HkgEme78jcoLI3RIhkEHo8iUDpEJEcZ/Q//qQytGVFH//rIhICkAqAgdCoFIhICs1gIi4CkX" +
    "JbrT+MIu9aZM//MoxMQLaC5yXhmSAEFNRTMuMTAwqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" +
    "qqqqqqqqqqqq//MoxNEMGCJMVmPeAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" +
    "qqqqqqqqqqqq//MoxNsLWCpIdmJSAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" +
    "qqqqqqqqqqqq//MoxOgNcDIEAEpMAKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq" +
    "qqqqqqqqqqqq",
  },
  video: {
    mime: "video/mp4",
    expect: "5193",
    b64:
    "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAMmbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAA" +
    "AQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
    "AAAAAgAAAlB0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAA" +
    "AAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAS4AAAB6AAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAAAAABAAAAAAHI" +
    "bWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAABAAAAAQABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRl" +
    "b0hhbmRsZXIAAAABc21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAA" +
    "AQAAATNzdGJsAAAAs3N0c2QAAAAAAAAAAQAAAKNhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAS4AegBIAAAASAAAAAAA" +
    "AAABFUxhdmM2MC4zMS4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAOWF2Y0MBZAAV/+EAG2dkABWscgRBMR6khAAAAwAE" +
    "AAADABA8WLYRgAEAB2joQ4RLIsD9+PgAAAAAFGJ0cnQAAAAAAAAiMAAAIjAAAAAYc3R0cwAAAAAAAAABAAAAAgAAIAAAAAAU" +
    "c3RzcwAAAAAAAAABAAAAAQAAABxzdHNjAAAAAAAAAAEAAAABAAAAAgAAAAEAAAAcc3RzegAAAAAAAAAAAAAAAgAABCoAAAAc" +
    "AAAAFHN0Y28AAAAAAAAAAQAAA1YAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAA" +
    "AAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYwLjE2LjEwMAAAAAhmcmVlAAAETm1kYXQAAAKvBgX//6vc" +
    "Rem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IDMxZTE5ZjkgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0g" +
    "Q29weWxlZnQgMjAwMy0yMDIzIC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9" +
    "MSByZWY9MTYgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDEzMyBtZT11bWggc3VibWU9MTAgcHN5PTEgcHN5X3JkPTEu" +
    "MDA6MC4wMCBtaXhlZF9yZWY9MSBtZV9yYW5nZT0yNCBjaHJvbWFfbWU9MSB0cmVsbGlzPTIgOHg4ZGN0PTEgY3FtPTAgZGVh" +
    "ZHpvbmU9MjEsMTEgZmFzdF9wc2tpcD0xIGNocm9tYV9xcF9vZmZzZXQ9LTIgdGhyZWFkcz00IGxvb2thaGVhZF90aHJlYWRz" +
    "PTEgc2xpY2VkX3RocmVhZHM9MCBucj0wIGRlY2ltYXRlPTEgaW50ZXJsYWNlZD0wIGJsdXJheV9jb21wYXQ9MCBjb25zdHJh" +
    "aW5lZF9pbnRyYT0wIGJmcmFtZXM9OCBiX3B5cmFtaWQ9MiBiX2FkYXB0PTIgYl9iaWFzPTAgZGlyZWN0PTMgd2VpZ2h0Yj0x" +
    "IG9wZW5fZ29wPTAgd2VpZ2h0cD0yIGtleWludD0yNTAga2V5aW50X21pbj0yIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9" +
    "MCByY19sb29rYWhlYWQ9NjAgcmM9Y3JmIG1idHJlZT0xIGNyZj0zMC4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBx" +
    "cHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAABc2WIgQACn/728P4FNjuY0JcRzeidMx+/Fbi6NDe9zgAfaZok" +
    "4rpAG5Jh4+CKeFM4O86ro3qAymHkqc/xABvQ3WMDgW8OpG9e7jUaDYIMaH5PAiELrSOqe0isQFNSkmp7RVxhVXMsRR8Aw2eU" +
    "wz3XSpkLy61Co5SMEGQ8gq0gZSxh3wDhr4lvo3aW9oPd8hDexz0WtkOvnZ9S2TRYdPCA/AsxODmRRhCmgZ1RSq6Tu4kinAei" +
    "z7dqA+3zMbg7vc/YuJt+wzGgoSYDWUBm++HgMG5NjF8HvVOR+M9oadkF5zVNr3eVdYhk0rCoMmc8blArebaIlFFU1xOs19VK" +
    "LLiExZ/4IHpeWMYxeQdLH7DZUWVXDSewK9tJqAOnmMF0TJ/p7mpi75T2SPlur/uq6E9h9XU7gxswOSmhU9yQr0iQMvm6B6Lu" +
    "8Mek6DWGPqDrmHWurH6TH2obieaUTA1CNiLvGyY/pgIwjHP8KTiJvdTkqKq834N7AAAAGEGaCC2IJf/+jLIhW71LUhpBsUlk" +
    "1dgUuA==",
  },
};

// data: URI for a fixture, the shape every media block type wants.
export const fixtureDataUri = (f) => `data:${f.mime};base64,${f.b64}`;
