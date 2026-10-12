/* Shared font catalog. Persisted keys remain stable for existing capsules. */
(function(root){
 'use strict';
 const catalog={
  "elegant": {
    "family": "Cormorant Garamond",
    "weight": "700",
    "css": "\"Cormorant Garamond\",serif"
  },
  "classic": {
    "family": "Playfair Display",
    "weight": "600",
    "css": "\"Playfair Display\",serif"
  },
  "modern": {
    "family": "Quicksand",
    "weight": "700",
    "css": "\"Quicksand\",sans-serif"
  },
  "romantic": {
    "family": "Great Vibes",
    "weight": "400",
    "css": "\"Great Vibes\",sans-serif"
  },
  "editorial": {
    "family": "Abril Fatface",
    "weight": "400",
    "css": "\"Abril Fatface\",serif"
  },
  "refined": {
    "family": "Cinzel",
    "weight": "600",
    "css": "\"Cinzel\",serif"
  },
  "contemporary": {
    "family": "Oswald",
    "weight": "600",
    "css": "\"Oswald\",sans-serif"
  },
  "signature": {
    "family": "Caveat",
    "weight": "700",
    "css": "\"Caveat\",sans-serif"
  },
  "heritage": {
    "family": "Pacifico",
    "weight": "400",
    "css": "\"Pacifico\",sans-serif"
  },
  "literary": {
    "family": "Amatic SC",
    "weight": "700",
    "css": "\"Amatic SC\",sans-serif"
  },
  "friendly": {
    "family": "Josefin Sans",
    "weight": "600",
    "css": "\"Josefin Sans\",sans-serif"
  },
  "clear": {
    "family": "Special Elite",
    "weight": "400",
    "css": "\"Special Elite\",sans-serif"
  }
};
 Object.values(catalog).forEach(Object.freeze);Object.freeze(catalog);
 const get=key=>catalog[key]||catalog.elegant;
 root.SuiteTypography=Object.freeze({catalog,family:key=>get(key).family,weight:key=>get(key).weight,css:key=>get(key).css});
})(window);
