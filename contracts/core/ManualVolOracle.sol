//SPDX-License-Identifier: GPL-3.0
pragma experimental ABIEncoderV2;
pragma solidity 0.7.3;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ManualVolOracle is AccessControl {
    /// @dev The identifier of the role which maintains other roles.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN");

    /// @dev Map of instrument id to IV
    mapping(bytes32 => uint256) private annualizedVols;

    /**
     * Instrument describe an option with a specific delta, asset and its option type.
     */
    struct Instrument {
        // option delta
        uint256 delta;
        // ERC20 token
        address asset;
        // If an otoken is a put or not
        bool isPut;
    }

    /**
     * @notice Creates an volatility oracle for a pool
     * @param _admin is the admin
     */
    constructor(address _admin) {
        require(_admin != address(0), "!_admin");

        // Add _admin as admin
        _setupRole(ADMIN_ROLE, _admin);
        _setupRole(DEFAULT_ADMIN_ROLE, _admin);
    }

    /// @dev A modifier which checks that the caller has the admin role.
    modifier onlyAdmin() {
        require(hasRole(ADMIN_ROLE, msg.sender), "!admin");
        _;
    }

    /**
     * @notice Returns the standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return standardDeviation is the standard deviation of the asset
     */
    function vol(bytes32) public pure returns (uint256 standardDeviation) {
        return 0;
    }

    /**
     * @notice Returns the annualized standard deviation of the base currency in 10**8 i.e. 1*10**8 = 100%
     * @return annualStdev is the annualized standard deviation of the asset
     */
    function annualizedVol(bytes32 instrumentId)
        public
        view
        returns (uint256 annualStdev)
    {
        return annualizedVols[instrumentId];
    }

    /**
     * @notice Computes the instrument id for a given Instrument struct
     * @param instrument is an Instrument struct to encode
     */
    function getInstrumentId(Instrument calldata instrument)
        external
        pure
        returns (bytes32)
    {
        return
            keccak256(
                abi.encodePacked(
                    instrument.delta,
                    instrument.asset,
                    instrument.isPut
                )
            );
    }

    /**
     * @notice Sets the annualized standard deviation of the base currency of one or more `pool(s)`
     * @param _instrumentIds is an array of Instrument IDs encoded and hashed with instrumentId
     * @param _newAnnualizedVols is an array of the annualized volatility with 10**8 decimals i.e. 1*10**8 = 100%
     */
    function setAnnualizedVol(
        bytes32[] calldata _instrumentIds,
        uint256[] calldata _newAnnualizedVols
    ) external onlyAdmin {
        require(
            _instrumentIds.length == _newAnnualizedVols.length,
            "Input lengths mismatched"
        );

        for (uint256 i = 0; i < _instrumentIds.length; i++) {
            bytes32 instrumentId = _instrumentIds[i];
            uint256 newAnnualizedVol = _newAnnualizedVols[i];

            require(newAnnualizedVol > 50 * 10**6, "Cannot be less than 50%");
            require(newAnnualizedVol < 400 * 10**6, "Cannot be more than 400%");

            annualizedVols[instrumentId] = newAnnualizedVol;
        }
    }
}
