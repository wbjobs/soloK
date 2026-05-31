package db

import (
	"task-scheduler/config"
	"task-scheduler/models"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var DB *gorm.DB

func Init(cfg *config.Config) error {
	var err error
	DB, err = gorm.Open(mysql.Open(cfg.DSN()), &gorm.Config{})
	if err != nil {
		return err
	}

	err = DB.AutoMigrate(&models.Task{}, &models.Worker{})
	if err != nil {
		return err
	}

	return nil
}

func GetDB() *gorm.DB {
	return DB
}
