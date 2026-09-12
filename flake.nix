{
  description = "The Legend of Nelda - Phase 1 development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24 # Node.js LTS (Krypton)
            pkgs.pnpm
          ];

          shellHook = ''
            echo "the-legend-of-nelda dev shell"
            echo "  node $(node --version)  /  pnpm $(pnpm --version)"
            echo "  pnpm install && pnpm dev"
          '';
        };
      }
    );
}
