{
  description = "SMPP TypeScript";

  inputs = {
    hotPot.url = "github:shopstic/nix-hot-pot";
    nixpkgs.follows = "hotPot/nixpkgs";
    flakeUtils.follows = "hotPot/flakeUtils";
  };

  outputs = { self, nixpkgs, flakeUtils, hotPot }:
    flakeUtils.lib.eachSystem [ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ]
      (system:
        let
          pkgs = import nixpkgs { inherit system; };
          hotPotPkgs = hotPot.packages.${system};
          runtimeInputs = builtins.attrValues
            {
              inherit (pkgs)
                nodejs-18_x
                ;
            };
        in
        rec {
          devShell = pkgs.mkShellNoCC {
            buildInputs = runtimeInputs;
          };
          packages = { };
        }
      );
}
