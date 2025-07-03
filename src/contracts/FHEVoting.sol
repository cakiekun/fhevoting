// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "./ZamaConfig.sol";

/**
 * @title FHEVoting
 * @dev Fully Homomorphic Encryption based voting system for DAOs
 * @notice This contract enables private voting where individual votes remain encrypted
 * while still allowing for accurate tallying of results using Zama's FHEVM on Sepolia
 */
contract FHEVoting is SepoliaConfig {
    struct Proposal {
        uint256 id;
        string title;
        string description;
        string[] options;
        uint256 startTime;
        uint256 endTime;
        uint256 totalVotes;
        mapping(uint256 => euint32) encryptedVoteCounts; // option index => encrypted count
        mapping(address => bool) hasVoted;
        bool resultsRevealed;
        uint256[] revealedResults;
        address creator;
        bool active;
    }

    struct ProposalInfo {
        uint256 id;
        string title;
        string description;
        string[] options;
        uint256 startTime;
        uint256 endTime;
        uint256 totalVotes;
        address creator;
        bool active;
        bool resultsRevealed;
        uint256[] revealedResults;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(address => bool) public authorizedVoters;
    mapping(address => bool) public admins;

    uint256 public proposalCount;
    address public owner;

    event ProposalCreated(
        uint256 indexed proposalId,
        string title,
        address indexed creator,
        uint256 startTime,
        uint256 endTime
    );

    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 totalVotes);

    event ResultsRevealed(uint256 indexed proposalId, uint256[] results);

    event VoterAuthorized(address indexed voter, address indexed admin);
    event AdminAdded(address indexed admin, address indexed addedBy);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    modifier onlyAdmin() {
        require(admins[msg.sender] || msg.sender == owner, "Only admin can perform this action");
        _;
    }

    modifier onlyAuthorizedVoter() {
        require(authorizedVoters[msg.sender], "Not authorized to vote");
        _;
    }

    modifier validProposal(uint256 _proposalId) {
        require(_proposalId < proposalCount, "Invalid proposal ID");
        require(proposals[_proposalId].active, "Proposal not active");
        _;
    }

    modifier votingPeriod(uint256 _proposalId) {
        require(
            block.timestamp >= proposals[_proposalId].startTime && block.timestamp <= proposals[_proposalId].endTime,
            "Voting period not active"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
        authorizedVoters[msg.sender] = true;
    }

    /**
     * @dev Add an admin who can manage proposals and voters
     */
    function addAdmin(address _admin) external onlyOwner {
        admins[_admin] = true;
        emit AdminAdded(_admin, msg.sender);
    }

    /**
     * @dev Authorize a voter to participate in votes
     */
    function authorizeVoter(address _voter) external onlyAdmin {
        authorizedVoters[_voter] = true;
        emit VoterAuthorized(_voter, msg.sender);
    }

    /**
     * @dev Authorize multiple voters at once
     */
    function authorizeVoters(address[] calldata _voters) external onlyAdmin {
        for (uint256 i = 0; i < _voters.length; i++) {
            authorizedVoters[_voters[i]] = true;
            emit VoterAuthorized(_voters[i], msg.sender);
        }
    }

    /**
     * @dev Create a new proposal with multiple options
     */
    function createProposal(
        string calldata _title,
        string calldata _description,
        string[] calldata _options,
        uint256 _votingDuration
    ) external onlyAdmin returns (uint256) {
        require(_options.length >= 2, "At least 2 options required");
        require(_options.length <= 10, "Maximum 10 options allowed");
        require(_votingDuration > 0, "Voting duration must be positive");

        uint256 proposalId = proposalCount++;
        Proposal storage newProposal = proposals[proposalId];

        newProposal.id = proposalId;
        newProposal.title = _title;
        newProposal.description = _description;

        // Manually copy options array to avoid calldata to storage issue
        for (uint256 i = 0; i < _options.length; i++) {
            newProposal.options.push(_options[i]);
        }

        newProposal.startTime = block.timestamp;
        newProposal.endTime = block.timestamp + _votingDuration;
        newProposal.creator = msg.sender;
        newProposal.active = true;

        // Initialize encrypted vote counts for each option to 0
        for (uint256 i = 0; i < _options.length; i++) {
            newProposal.encryptedVoteCounts[i] = FHE.asEuint32(0);
            // Allow this contract and creator to access the encrypted values
            FHE.allowThis(newProposal.encryptedVoteCounts[i]);
            FHE.allow(newProposal.encryptedVoteCounts[i], msg.sender);
        }

        emit ProposalCreated(proposalId, _title, msg.sender, newProposal.startTime, newProposal.endTime);

        return proposalId;
    }

    /**
     * @dev Cast an encrypted vote for a specific option
     * @param _proposalId The proposal to vote on
     * @param _optionIndex The option to vote for
     * @param _encryptedVote Encrypted vote value (should be 1 for the chosen option)
     * @param _inputProof Zero-knowledge proof for the encrypted vote
     */
    function castVote(
        uint256 _proposalId,
        uint256 _optionIndex,
        externalEuint32 _encryptedVote,
        bytes calldata _inputProof
    ) external onlyAuthorizedVoter validProposal(_proposalId) votingPeriod(_proposalId) {
        Proposal storage proposal = proposals[_proposalId];
        require(!proposal.hasVoted[msg.sender], "Already voted");
        require(_optionIndex < proposal.options.length, "Invalid option");

        // Convert the encrypted input to euint32
        euint32 vote = FHE.fromExternal(_encryptedVote, _inputProof);

        // Add the encrypted vote to the corresponding option using homomorphic addition
        proposal.encryptedVoteCounts[_optionIndex] = FHE.add(proposal.encryptedVoteCounts[_optionIndex], vote);

        // Allow access to the updated encrypted count
        FHE.allowThis(proposal.encryptedVoteCounts[_optionIndex]);
        FHE.allow(proposal.encryptedVoteCounts[_optionIndex], msg.sender);

        proposal.hasVoted[msg.sender] = true;
        proposal.totalVotes++;

        emit VoteCast(_proposalId, msg.sender, proposal.totalVotes);
    }

    /**
     * @dev Set results manually by admin (replaces automatic decryption)
     * @param _proposalId The proposal to set results for
     * @param _results Array of vote counts for each option
     * @notice In production, results would be obtained through off-chain decryption
     * or threshold decryption mechanisms provided by Zama's infrastructure
     */
    function setResults(
        uint256 _proposalId,
        uint256[] calldata _results
    ) external onlyAdmin validProposal(_proposalId) {
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp > proposal.endTime, "Voting still active");
        require(!proposal.resultsRevealed, "Results already revealed");
        require(_results.length == proposal.options.length, "Results length mismatch");

        // Manually copy results array to avoid calldata to storage issue
        delete proposal.revealedResults;
        for (uint256 i = 0; i < _results.length; i++) {
            proposal.revealedResults.push(_results[i]);
        }

        proposal.resultsRevealed = true;

        emit ResultsRevealed(_proposalId, proposal.revealedResults);
    }

    /**
     * @dev Request decryption for a proposal's encrypted vote counts
     * @param _proposalId The proposal to request decryption for
     * @notice This function prepares the encrypted data for off-chain decryption
     * The actual decryption should be handled by Zama's decryption infrastructure
     */
    function requestDecryption(uint256 _proposalId) external onlyAdmin validProposal(_proposalId) {
        Proposal storage proposal = proposals[_proposalId];
        require(block.timestamp > proposal.endTime, "Voting still active");
        require(!proposal.resultsRevealed, "Results already revealed");

        // Allow the decryption oracle to access the encrypted vote counts
        for (uint256 i = 0; i < proposal.options.length; i++) {
            // The decryption oracle address should be allowed to decrypt
            // This is handled by Zama's infrastructure
            FHE.allowThis(proposal.encryptedVoteCounts[i]);
        }

        // In a production environment, this would trigger the decryption process
        // through Zama's decryption infrastructure
    }

    /**
     * @dev Get proposal information
     */
    function getProposal(uint256 _proposalId) external view returns (ProposalInfo memory) {
        require(_proposalId < proposalCount, "Invalid proposal ID");
        Proposal storage proposal = proposals[_proposalId];

        return
            ProposalInfo({
                id: proposal.id,
                title: proposal.title,
                description: proposal.description,
                options: proposal.options,
                startTime: proposal.startTime,
                endTime: proposal.endTime,
                totalVotes: proposal.totalVotes,
                creator: proposal.creator,
                active: proposal.active,
                resultsRevealed: proposal.resultsRevealed,
                revealedResults: proposal.revealedResults
            });
    }

    /**
     * @dev Get all active proposals
     */
    function getActiveProposals() external view returns (ProposalInfo[] memory) {
        uint256 activeCount = 0;

        // Count active proposals
        for (uint256 i = 0; i < proposalCount; i++) {
            if (proposals[i].active) {
                activeCount++;
            }
        }

        ProposalInfo[] memory activeProposals = new ProposalInfo[](activeCount);
        uint256 index = 0;

        // Populate active proposals
        for (uint256 i = 0; i < proposalCount; i++) {
            if (proposals[i].active) {
                Proposal storage proposal = proposals[i];
                activeProposals[index] = ProposalInfo({
                    id: proposal.id,
                    title: proposal.title,
                    description: proposal.description,
                    options: proposal.options,
                    startTime: proposal.startTime,
                    endTime: proposal.endTime,
                    totalVotes: proposal.totalVotes,
                    creator: proposal.creator,
                    active: proposal.active,
                    resultsRevealed: proposal.resultsRevealed,
                    revealedResults: proposal.revealedResults
                });
                index++;
            }
        }

        return activeProposals;
    }

    /**
     * @dev Check if user has voted on a proposal
     */
    function hasVoted(uint256 _proposalId, address _voter) external view returns (bool) {
        require(_proposalId < proposalCount, "Invalid proposal ID");
        return proposals[_proposalId].hasVoted[_voter];
    }

    /**
     * @dev Check if address is authorized voter
     */
    function isAuthorizedVoter(address _voter) external view returns (bool) {
        return authorizedVoters[_voter];
    }

    /**
     * @dev Check if address is admin
     */
    function isAdmin(address _admin) external view returns (bool) {
        return admins[_admin];
    }

    /**
     * @dev Deactivate a proposal (admin only)
     */
    function deactivateProposal(uint256 _proposalId) external onlyAdmin validProposal(_proposalId) {
        proposals[_proposalId].active = false;
    }

    /**
     * @dev Get encrypted vote count for a specific option (returns encrypted data)
     * @notice This returns encrypted data - cannot be read directly
     */
    function getEncryptedVoteCount(uint256 _proposalId, uint256 _optionIndex) external view returns (euint32) {
        require(_proposalId < proposalCount, "Invalid proposal ID");
        require(_optionIndex < proposals[_proposalId].options.length, "Invalid option");
        return proposals[_proposalId].encryptedVoteCounts[_optionIndex];
    }
}
