#pragma once

#include "phylogeny/PhylogeneticFeatures.h"
#include <string>
#include <vector>
#include <map>
#include <memory>
#include <fstream>

namespace Fossil3D {

enum class NexusDataType {
    STANDARD,
    CONTINUOUS,
    DNA,
    PROTEIN,
    MIXED
};

struct NexusExportOptions {
    NexusDataType dataType;
    bool includeHeaders;
    bool includeNotes;
    bool discretizeContinuous;
    int numStates;
    double missingValue;
    char gapCharacter;
    char missingCharacter;
    std::string customNotes;

    NexusExportOptions()
        : dataType(NexusDataType::CONTINUOUS)
        , includeHeaders(true)
        , includeNotes(true)
        , discretizeContinuous(false)
        , numStates(3)
        , missingValue(-1.0)
        , gapCharacter('-')
        , missingCharacter('?') {}
};

class NexusExporter {
public:
    NexusExporter();
    ~NexusExporter();

    void setOptions(const NexusExportOptions& options);

    bool exportToFile(const std::string& filepath,
                     const std::vector<PhylogeneticDataset>& datasets,
                     const std::vector<std::string>& selectedFeatures = {});

    std::string generateNexusString(const std::vector<PhylogeneticDataset>& datasets,
                                    const std::vector<std::string>& selectedFeatures = {});

    std::string generateHeader(const std::vector<PhylogeneticDataset>& datasets);
    std::string generateTaxaBlock(const std::vector<PhylogeneticDataset>& datasets);
    std::string generateCharactersBlock(const std::vector<PhylogeneticDataset>& datasets,
                                       const std::vector<std::string>& selectedFeatures);
    std::string generateContinuousBlock(const std::vector<PhylogeneticDataset>& datasets,
                                        const std::vector<std::string>& selectedFeatures);
    std::string generateNotesBlock(const std::vector<PhylogeneticDataset>& datasets);

    std::vector<std::string> getCommonFeatures(const std::vector<PhylogeneticDataset>& datasets);

private:
    NexusExportOptions m_options;

    std::string formatContinuousValue(double value, int precision = 6);
    std::string formatDiscreteValue(double value, double min, double max);
    std::string truncateTaxonName(const std::string& name, int maxLength = 20);
    std::string escapeNexusString(const std::string& input);

    double getFeatureMin(const std::vector<PhylogeneticDataset>& datasets,
                         const std::string& featureName);
    double getFeatureMax(const std::vector<PhylogeneticDataset>& datasets,
                         const std::string& featureName);

    bool fileExists(const std::string& filepath);
    bool createDirectory(const std::string& filepath);
};

}
